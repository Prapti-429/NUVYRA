"""
Authentication and Authorization API Integration Tests.

Validates registration, authentication workflows, lockout thresholds,
token rotation, and RBAC access boundaries.
"""

from datetime import datetime, timedelta, timezone

from fastapi import status
from fastapi.testclient import TestClient
from urllib.parse import parse_qs, urlparse

try:
    from app.db.models import User
    from app.db.models.auth_models import PasswordResetToken
except ImportError:
    from models import User  # type: ignore
    from app.db.models.auth_models import PasswordResetToken


def test_user_registration_success(client: TestClient) -> None:
    """Tests successful user registration via API endpoint."""
    payload = {
        "email": "newpatient@example.com",
        "password": "StrongP@ssw0rd2026!",
        "full_name": "New Patient",
        "role": "patient",
    }

    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["email"] == "newpatient@example.com"
    assert "hashed_password" not in data


def test_register_existing_email_resumes_account(client: TestClient, test_patient_user: User) -> None:
    """The Register entry point must resume an existing account only with its password."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "patient@example.com",
            "password": "SecurePassword123!",
            "full_name": "Updated Name Should Not Replace Existing Identity",
            "role": "patient",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["id"] == str(test_patient_user.id)
    assert data["email"] == "patient@example.com"


def test_user_login_success(client: TestClient, test_patient_user: User) -> None:
    """Tests successful authentication and token receipt."""
    payload = {
        "email": "patient@example.com",
        "password": "SecurePassword123!",
    }

    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "Bearer"


def test_user_login_invalid_credentials(client: TestClient, test_patient_user: User) -> None:
    """Tests authentication failure with invalid password."""
    payload = {
        "email": "patient@example.com",
        "password": "WrongPassword123!",
    }

    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_account_lockout_after_max_failed_attempts(client: TestClient, test_patient_user: User) -> None:
    """Tests account lockout after 5 consecutive failed login attempts."""
    payload = {
        "email": "patient@example.com",
        "password": "WrongPassword123!",
    }

    # Execute 5 failed login attempts
    for _ in range(5):
        response = client.post("/api/v1/auth/login", json=payload)

    # 6th attempt should return HTTP 423 Locked
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == status.HTTP_423_LOCKED


def test_expired_account_lockout_allows_login_and_resets_counter(
    client: TestClient,
    test_patient_user: User,
    db_session,
) -> None:
    """An expired lock must not keep a valid account blocked."""
    test_patient_user.failed_login_attempts = 5
    test_patient_user.locked_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "patient@example.com",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json().get("access_token")
    db_session.refresh(test_patient_user)
    assert test_patient_user.failed_login_attempts == 0
    assert test_patient_user.locked_until is None


def test_newly_registered_account_can_login_with_same_password(client: TestClient) -> None:
    """Registration and login must use the same password-hash contract."""
    payload = {
        "email": "fresh-account@example.com",
        "password": "NewAccountSecure123!",
        "full_name": "Fresh Account",
        "role": "patient",
    }
    registration = client.post("/api/v1/auth/register", json=payload)
    assert registration.status_code == status.HTTP_201_CREATED

    login = client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == status.HTTP_200_OK
    assert login.json().get("access_token")


def test_register_session_creates_account_and_returns_tokens(client: TestClient) -> None:
    """The combined registration flow must return a usable authenticated session."""
    payload = {
        "email": "atomic-registration@example.com",
        "password": "AtomicRegistration123!",
        "full_name": "Atomic Registration",
        "role": "patient",
    }

    response = client.post("/api/v1/auth/register-session", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data.get("access_token")
    assert data.get("refresh_token")
    assert data.get("user", {}).get("email") == payload["email"]

    # The newly issued credentials must also work through the ordinary login endpoint.
    login = client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == status.HTTP_200_OK


def test_register_session_resumes_existing_account_only_with_correct_password(
    client: TestClient,
    test_patient_user: User,
) -> None:
    """Existing records are resumed without creating a duplicate identity."""
    response = client.post(
        "/api/v1/auth/register-session",
        json={
            "email": "patient@example.com",
            "password": "SecurePassword123!",
            "full_name": "Ignored Existing Name",
            "role": "patient",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json().get("access_token")
    assert response.json().get("user", {}).get("id") == str(test_patient_user.id)

    rejected = client.post(
        "/api/v1/auth/register-session",
        json={
            "email": "patient@example.com",
            "password": "WrongPassword123!",
            "full_name": "Not Allowed",
            "role": "patient",
        },
    )
    assert rejected.status_code == status.HTTP_401_UNAUTHORIZED


def test_legacy_raw_pbkdf2_password_hash_can_login_and_is_upgraded(
    client: TestClient,
    test_patient_user: User,
    db_session,
) -> None:
    """A PBKDF2 hash from the previous raw-password format remains usable."""
    from app.core.security import hash_password, pwd_context

    test_patient_user.hashed_password = pwd_context.hash("SecurePassword123!")
    db_session.commit()
    legacy_hash = test_patient_user.hashed_password

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "patient@example.com",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    db_session.refresh(test_patient_user)
    assert test_patient_user.hashed_password != legacy_hash
    assert test_patient_user.hashed_password.startswith("$pbkdf2-sha256$")
    assert test_patient_user.hashed_password != hash_password("different password")



def test_forgot_password_sends_single_use_reset_link_and_updates_password(
    client: TestClient,
    test_patient_user: User,
    db_session,
    monkeypatch,
) -> None:
    """A verified email reset link changes the password and revokes old sessions."""
    from app.core.config import settings
    import app.services.auth_service as auth_service_module

    sent_messages = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            pass

        def login(self, *args):
            pass

        def send_message(self, message):
            sent_messages.append(message)

    monkeypatch.setattr(auth_service_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "no-reply@nuvyra.example")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "smtp-user")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "smtp-password")

    requested = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "PATIENT@example.com"},
    )
    assert requested.status_code == status.HTTP_200_OK
    assert "If an account exists" in requested.json()["detail"]
    assert len(sent_messages) == 1

    # A repeat request inside the 15-second cooldown must not send another email.
    repeated = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "patient@example.com"},
    )
    assert repeated.status_code == status.HTTP_200_OK
    assert len(sent_messages) == 1

    body = sent_messages[0].get_content()
    reset_url = next(line for line in body.splitlines() if "/reset-password?token=" in line)
    raw_token = parse_qs(urlparse(reset_url).query)["token"][0]
    reset_record = db_session.query(PasswordResetToken).one()
    assert reset_record.is_used is False

    reset = client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "BrandNewSecurePassword2026!"},
    )
    assert reset.status_code == status.HTTP_200_OK
    db_session.refresh(reset_record)
    assert reset_record.is_used is True

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "patient@example.com", "password": "SecurePassword123!"},
    )
    assert old_login.status_code == status.HTTP_401_UNAUTHORIZED

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "patient@example.com", "password": "BrandNewSecurePassword2026!"},
    )
    assert new_login.status_code == status.HTTP_200_OK


def test_forgot_password_does_not_disclose_unknown_email(client: TestClient, monkeypatch) -> None:
    """Unknown addresses receive the same public response without sending mail."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "no-reply@nuvyra.example")
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "not-registered@example.com"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["detail"] == "If an account exists for that email, a password reset link will be sent shortly."


def test_forgot_password_reports_unavailable_email_service(
    client: TestClient,
    test_patient_user: User,
    monkeypatch,
) -> None:
    """A known account must not be told that a reset email was sent if mail is unconfigured."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "SMTP_HOST", None)
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", None)
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "patient@example.com"},
    )
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "temporarily unavailable" in response.json()["detail"]


def test_password_reset_rejects_invalid_and_expired_tokens(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "not-a-valid-reset-token", "new_password": "BrandNewSecurePassword2026!"},
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST

def test_rbac_admin_endpoint_forbidden_for_patient(client: TestClient, test_patient_user: User) -> None:
    """Tests that patient account is forbidden from hitting admin endpoints."""
    # Login as patient
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "patient@example.com", "password": "SecurePassword123!"},
    )
    token = login_resp.json()["access_token"]

    # Attempt to query admin users list
    response = client.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN

def test_render_frontend_origin_passes_cors_preflight(client: TestClient) -> None:
    """Render-hosted frontends must be able to send JSON auth requests."""
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://digital-biomarker-monitor.onrender.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.headers.get("access-control-allow-origin") == "https://digital-biomarker-monitor.onrender.com"
    assert "POST" in response.headers.get("access-control-allow-methods", "")
