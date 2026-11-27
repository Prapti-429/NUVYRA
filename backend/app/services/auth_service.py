"""Authentication service for registration, login, refresh rotation and logout."""

import hashlib
import logging
import secrets
import smtplib
import json
import urllib.error
import urllib.request
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.exceptions import InvalidCredentialsException, AccountLockedException, AccountDisabledException, InvalidTokenError, TokenRevokedError
from app.core.config import settings
from app.core.jwt import JWTEngine
from app.core.security import hash_password, verify_password, password_uses_legacy_raw_material
from app.db.models import User
from app.db.models.auth_models import PasswordResetToken
from app.repositories.base import DuplicateEntityError
from app.repositories.session_repository import SessionRepository
from app.repositories.user_repository import UserRepository
from app.services.audit_service import AuditService
from app.services.authorization_service import AuthorizationService
from app.schemas.auth_enums import TokenType, UserRole
from app.schemas.auth_schemas import LoginRequest, TokenResponse, UserRegisterRequest

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15
PASSWORD_RESET_TTL_MINUTES = 30
PASSWORD_RESET_RESEND_SECONDS = 60
logger = logging.getLogger(__name__)


class AuthenticationService:
    def __init__(self, db: Session, jwt_engine: JWTEngine) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.session_repo = SessionRepository(db)
        self.authz_service = AuthorizationService(db)
        self.audit_service = AuditService(db)
        self.jwt_engine = jwt_engine

    def register_user(self, payload: UserRegisterRequest, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> User:
        """
        Create a new account, or resume an existing account from the Register
        screen when the email and password already belong to that account.

        This is intentionally password-gated: an email match alone never grants
        access to an existing user's data and never creates a second identity.
        """
        normalized_email = str(payload.email).strip().lower()
        existing = self.user_repo.get_by_email(normalized_email)

        if existing:
            # The Register screen doubles as a safe "returning participant"
            # entry point. Only the existing password can unlock that account.
            if not existing.is_active:
                raise AccountDisabledException()
            if not verify_password(payload.password, existing.hashed_password):
                raise InvalidCredentialsException()
            return existing

        role_value = payload.role.value if isinstance(payload.role, UserRole) else str(payload.role)
        user = self.user_repo.create_user({
            "email": normalized_email,
            "hashed_password": hash_password(payload.password),
            "full_name": payload.full_name,
            "role": role_value,
            "is_active": True,
            "is_verified": False,
        })
        self.audit_service.record_event(
            action="USER_REGISTER",
            user_id=user.id,
            actor_email=user.email,
            status="SUCCESS",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return user

    def register_and_authenticate(
        self,
        payload: UserRegisterRequest,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> TokenResponse:
        """
        Register a new account or verify an existing account, then issue its
        session in the same request and database session.

        This avoids the frontend's previous two-request register-then-login
        sequence, which could leave a successfully created account appearing
        unusable if the follow-up request reached a differently configured
        backend instance.
        """
        login_payload = LoginRequest(email=payload.email, password=payload.password)
        existing = self.user_repo.get_by_email(str(payload.email).strip().lower())
        if existing:
            # Route returning accounts through the normal login path so failed
            # passwords increment the same lockout counters and audit events.
            return self.authenticate_user(
                login_payload,
                ip_address=ip_address,
                user_agent=user_agent,
            )

        self.register_user(payload, ip_address=ip_address, user_agent=user_agent)
        return self.authenticate_user(
            login_payload,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def authenticate_user(self, payload: LoginRequest, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> TokenResponse:
        normalized_email = str(payload.email).strip().lower()
        user = self.user_repo.get_by_email(normalized_email)
        if not user:
            self._safe_audit(action="LOGIN_FAILED", actor_email=normalized_email, status="FAILURE", ip_address=ip_address, user_agent=user_agent, extra_data={"reason": "User not found"})
            raise InvalidCredentialsException()
        now = datetime.now(timezone.utc)
        # SQLite/Postgres drivers can return timezone columns as naive datetimes.
        # Normalize both sides before comparison so lockout logic is deterministic.
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        if user.locked_until:
            locked_until = user.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            else:
                locked_until = locked_until.astimezone(timezone.utc)
            if locked_until > now:
                remaining_seconds = max(1, int((locked_until - now).total_seconds()))
                remaining_minutes = max(1, (remaining_seconds + 59) // 60)
                self._safe_audit(
                    action="LOGIN_BLOCKED_LOCKOUT",
                    user_id=user.id,
                    actor_email=user.email,
                    status="FAILURE",
                    ip_address=ip_address,
                    user_agent=user_agent,
                    extra_data={"remaining_seconds": remaining_seconds},
                )
                raise AccountLockedException(
                    f"Too many unsuccessful sign-in attempts. Try again in about {remaining_minutes} minute(s)."
                )
            # The lockout window has elapsed. Clear stale lock state before
            # checking the supplied password so a returning user starts fresh.
            user.locked_until = None
            user.failed_login_attempts = 0
            self.db.commit()
        if not user.is_active:
            raise AccountDisabledException()
        if not verify_password(payload.password, user.hashed_password):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            self.db.commit()
            self._safe_audit(action="LOGIN_FAILED", user_id=user.id, actor_email=user.email, status="FAILURE", ip_address=ip_address, user_agent=user_agent, extra_data={"attempts": user.failed_login_attempts})
            raise InvalidCredentialsException()

        # Transparently migrate older PBKDF2 records after a successful
        # legacy-format verification. The user's password itself is unchanged.
        if password_uses_legacy_raw_material(payload.password, user.hashed_password):
            user.hashed_password = hash_password(payload.password)
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = now
        self.db.commit()

        persisted_role = str(user.role).strip().lower()
        # Older prototype data used "admin"; keep those accounts compatible
        # without granting any new privilege beyond administrator.
        if persisted_role == "admin":
            persisted_role = UserRole.ADMINISTRATOR.value
        try:
            role = UserRole(persisted_role)
        except ValueError:
            # Unknown legacy roles are treated as least-privileged patients.
            role = UserRole.PATIENT
        session_expiry = now + timedelta(days=self.jwt_engine.refresh_token_expire_days)
        session = self.session_repo.create_session(user_id=user.id, expires_at=session_expiry, ip_address=ip_address, user_agent=user_agent, device_fingerprint=payload.device_fingerprint)
        permissions = self.authz_service.get_user_permissions(role)
        access_token, _ = self.jwt_engine.create_access_token(subject=str(user.id), role=role, permissions=permissions, session_id=session.id)
        refresh_token, ref_payload = self.jwt_engine.create_refresh_token(subject=str(user.id), role=role, session_id=session.id)
        self.session_repo.create_refresh_token(jti=ref_payload.jti, session_id=session.id, user_id=user.id, token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(), expires_at=ref_payload.exp)
        self._safe_audit(action="LOGIN_SUCCESS", user_id=user.id, actor_email=user.email, status="SUCCESS", ip_address=ip_address, user_agent=user_agent)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="Bearer",
            expires_in=self.jwt_engine.access_token_expire_minutes * 60,
            user=user,
        )

    def _safe_audit(self, **kwargs) -> None:
        """Best-effort audit logging; audit failure must not break authentication."""
        try:
            self.audit_service.record_event(**kwargs)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Authentication audit event failed")

    def refresh_tokens(self, raw_refresh_token: str) -> TokenResponse:
        payload = self.jwt_engine.decode_token(raw_refresh_token, expected_type=TokenType.REFRESH)
        if not payload.sid:
            raise InvalidTokenError("Refresh token missing session context.")
        session = self.session_repo.get_active_session(payload.sid)
        if not session:
            raise TokenRevokedError("Associated session is revoked or expired.")
        ref_record = self.session_repo.get_refresh_token_by_jti(payload.jti)
        if not ref_record or ref_record.is_revoked:
            self.session_repo.revoke_session(payload.sid)
            raise TokenRevokedError("Token reuse detected. Session terminated.")
        self.session_repo.revoke_refresh_token(payload.jti)
        try:
            user_id = UUID(str(payload.sub))
        except ValueError as exc:
            raise InvalidTokenError("Refresh token contains an invalid user identifier.") from exc
        user = self.user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise InvalidTokenError("User account is unavailable.")
        persisted_role = str(user.role).strip().lower()
        if persisted_role == "admin":
            persisted_role = UserRole.ADMINISTRATOR.value
        try:
            role = UserRole(persisted_role)
        except ValueError:
            role = UserRole.PATIENT
        permissions = self.authz_service.get_user_permissions(role)
        new_access_token, _ = self.jwt_engine.create_access_token(subject=str(user.id), role=role, permissions=permissions, session_id=session.id)
        new_refresh_token, new_payload = self.jwt_engine.create_refresh_token(subject=str(user.id), role=role, session_id=session.id)
        self.session_repo.create_refresh_token(jti=new_payload.jti, session_id=session.id, user_id=user.id, token_hash=hashlib.sha256(new_refresh_token.encode()).hexdigest(), expires_at=new_payload.exp, parent_token_id=ref_record.id)
        # Return a fully parsed Python object; keep this block intentionally multiline.
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="Bearer",
            expires_in=self.jwt_engine.access_token_expire_minutes * 60,
            user=user,
        )


    def request_password_reset(self, email: str, ip_address: Optional[str] = None) -> None:
        """Send a short-lived, single-use password reset link without revealing account existence."""
        resend_ready = bool(settings.RESEND_API_KEY and settings.SMTP_FROM_EMAIL)
        smtp_ready = bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)
        if not (resend_ready or smtp_ready):
            logger.error(
                "Password reset email is not configured. Set RESEND_API_KEY and SMTP_FROM_EMAIL "
                "(recommended), or SMTP_HOST and SMTP_FROM_EMAIL."
            )
            raise RuntimeError("Password reset email delivery is not configured.")

        normalized_email = str(email).strip().lower()
        user = self.user_repo.get_by_email(normalized_email)
        if not user or not user.is_active:
            return

        now = datetime.now(timezone.utc)
        recent = self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.created_at >= now - timedelta(seconds=PASSWORD_RESET_RESEND_SECONDS),
            ).order_by(PasswordResetToken.created_at.desc())
        ).scalars().first()
        if recent:
            return

        # Invalidate earlier links before issuing a new one.
        self.db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.is_used.is_(False),
        ).update({"is_used": True, "used_at": now}, synchronize_session=False)

        raw_token = secrets.token_urlsafe(32)
        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            request_ip=ip_address,
            expires_at=now + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
            is_used=False,
        )
        self.db.add(reset_record)
        self.db.commit()

        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
        message = EmailMessage()
        message["Subject"] = "Reset your NUVYRA password"
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = normalized_email
        message.set_content(
            "We received a request to reset the password for your NUVYRA account.\n\n"
            f"Use this secure link within {PASSWORD_RESET_TTL_MINUTES} minutes:\n{reset_url}\n\n"
            "If you did not request this, you can ignore this email. Your password will not change.\n"
            "For your security, this link can only be used once."
        )
        try:
            if resend_ready:
                # Resend's HTTP API is more reliable on hosted platforms where
                # outbound SMTP ports may be restricted. The sender must be
                # verified in the Resend account before delivery is accepted.
                request = urllib.request.Request(
                    url="https://api.resend.com/emails",
                    data=json.dumps({
                        "from": settings.SMTP_FROM_EMAIL,
                        "to": [normalized_email],
                        "subject": message["Subject"],
                        "text": message.get_content(),
                    }).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=20) as response:
                    if response.status < 200 or response.status >= 300:
                        raise RuntimeError(f"Resend returned HTTP {response.status}")
            else:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                    if settings.SMTP_USE_TLS:
                        server.starttls()
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(message)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, smtplib.SMTPException, RuntimeError):
            # Do not leave an unusable token active or expose provider/account details to callers.
            reset_record.is_used = True
            reset_record.used_at = datetime.now(timezone.utc)
            self.db.commit()
            logger.exception("Unable to deliver NUVYRA password-reset email.")
            raise RuntimeError("Password reset email delivery failed.")

    def reset_password(self, raw_token: str, new_password: str) -> bool:
        """Replace a password using a valid, unexpired, single-use reset token."""
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        reset_record = self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.is_used.is_(False),
            )
        ).scalar_one_or_none()
        if not reset_record:
            return False

        now = datetime.now(timezone.utc)
        expires_at = reset_record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        else:
            expires_at = expires_at.astimezone(timezone.utc)
        if expires_at <= now:
            return False

        user = self.user_repo.get_by_id(reset_record.user_id)
        if not user or not user.is_active:
            return False

        user.hashed_password = hash_password(new_password)
        user.failed_login_attempts = 0
        user.locked_until = None
        reset_record.is_used = True
        reset_record.used_at = now
        # A password reset invalidates every other outstanding reset link.
        self.db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != reset_record.id,
            PasswordResetToken.is_used.is_(False),
        ).update({"is_used": True, "used_at": now}, synchronize_session=False)
        self.db.commit()

        # Force sign-in again on every device after a credential change.
        self.session_repo.revoke_all_user_sessions(user.id)
        self._safe_audit(
            action="PASSWORD_RESET",
            user_id=user.id,
            actor_email=user.email,
            status="SUCCESS",
            extra_data={"method": "email_reset"},
        )
        return True

    def logout(self, session_id: str, user_id: UUID) -> bool:
        revoked = self.session_repo.revoke_session(session_id)
        if revoked:
            self.audit_service.record_event(action="LOGOUT", user_id=user_id, status="SUCCESS")
        return revoked
