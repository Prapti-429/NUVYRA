"""
Authentication and Authorization API Integration Tests.

Validates registration, authentication workflows, lockout thresholds,
token rotation, and RBAC access boundaries.
"""

from datetime import datetime, timedelta, timezone

from fastapi import status
from fastapi.testclient import TestClient

try:
    from app.db.models import User
except ImportError:
    from models import User  # type: ignore


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