"""Security and cryptographic utilities."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import hashlib
import re

import jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import PasswordComplexityException

# PBKDF2 is the primary scheme for new passwords. bcrypt remains available for
# accounts created before the password-hashing migration.
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt"],
    deprecated=["bcrypt"],
)

ALGORITHM = "HS256"


def validate_password_complexity(password: str) -> str:
    reasons: list[str] = []
    if len(password) < 8:
        reasons.append("length")
    if not re.search(r"[A-Z]", password):
        reasons.append("uppercase")
    if not re.search(r"[a-z]", password):
        reasons.append("lowercase")
    if not re.search(r"\d", password):
        reasons.append("digit")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        reasons.append("special character")
    if reasons:
        raise PasswordComplexityException(reasons)
    return password


def _password_material(password: str) -> str:
    """Use a bounded representation for PBKDF2 while keeping legacy bcrypt compatible."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hash new passwords with PBKDF2."""
    return pwd_context.hash(_password_material(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify current PBKDF2 hashes and supported legacy password formats.

    Older deployments may contain bcrypt hashes or PBKDF2 hashes created
    directly from the password before the SHA-256 pre-hash was introduced.
    """
    if not hashed_password:
        return False
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        return pwd_context.verify(plain_password, hashed_password)

    # Current format: PBKDF2 over a fixed-length SHA-256 representation.
    if pwd_context.verify(_password_material(plain_password), hashed_password):
        return True

    # Compatibility with older PBKDF2 records created from the raw password.
    return pwd_context.verify(plain_password, hashed_password)


def password_uses_legacy_raw_material(plain_password: str, hashed_password: str) -> bool:
    """Identify legacy raw-password PBKDF2 hashes so they can be upgraded."""
    if not hashed_password or hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    try:
        return (
            pwd_context.verify(plain_password, hashed_password)
            and not pwd_context.verify(_password_material(plain_password), hashed_password)
        )
    except (ValueError, TypeError):
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)
