"""
Authentication REST Router (/api/v1/auth).

Exposes public endpoints for registration, password login, token refresh,
logout, and current identity verification.
"""

from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.session import get_db

from app.db.models import User
from app.core.jwt import JWTEngine, TokenPayload
from app.api.dependencies import (
    get_client_ip,
    get_current_user,
    get_jwt_engine,
    get_token_payload,
    get_user_agent,
)
from app.services.auth_service import AuthenticationService
from app.schemas.auth_schemas import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserRegisterRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.schemas.user_schemas import UserRead

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(
    payload: UserRegisterRequest,
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
    ip_address: Annotated[Optional[str], Depends(get_client_ip)] = None,
    user_agent: Annotated[Optional[str], Depends(get_user_agent)] = None,
) -> UserRead:
    """Registers a new platform user account."""
    auth_service = AuthenticationService(db, jwt_engine)
    user = auth_service.register_user(payload, ip_address=ip_address, user_agent=user_agent)
    return UserRead.model_validate(user)


@router.post(
    "/register-session",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Register or resume an account and issue a session",
)
def register_and_login(
    payload: UserRegisterRequest,
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
    ip_address: Annotated[Optional[str], Depends(get_client_ip)] = None,
    user_agent: Annotated[Optional[str], Depends(get_user_agent)] = None,
) -> TokenResponse:
    """Complete registration/account resumption and login in one request."""
    auth_service = AuthenticationService(db, jwt_engine)
    return auth_service.register_and_authenticate(
        payload,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and receive JWT token pair",
)
def login(
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
    ip_address: Annotated[Optional[str], Depends(get_client_ip)] = None,
    user_agent: Annotated[Optional[str], Depends(get_user_agent)] = None,
) -> TokenResponse:
    """Verifies user credentials and issues Access and Refresh tokens."""
    auth_service = AuthenticationService(db, jwt_engine)
    return auth_service.authenticate_user(payload, ip_address=ip_address, user_agent=user_agent)



@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Request a password reset email",
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
    ip_address: Annotated[Optional[str], Depends(get_client_ip)] = None,
) -> dict[str, str]:
    """Always return the same message to avoid disclosing whether an email is registered."""
    AuthenticationService(db, jwt_engine).request_password_reset(
        str(payload.email), ip_address=ip_address
    )
    return {"detail": "If an account exists for that email, a password reset link will be sent shortly."}


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Set a new password using a single-use reset token",
)
def reset_password(
    payload: ResetPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
) -> dict[str, str]:
    """Validate the reset token, replace the password, and revoke existing sessions."""
    success = AuthenticationService(db, jwt_engine).reset_password(
        payload.token, payload.new_password
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has expired. Please request a new one.",
        )
    return {"detail": "Your password has been reset. Please sign in with your new password."}


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Acquire a new JWT token pair using a valid Refresh Token",
)
def refresh_token(
    payload: RefreshTokenRequest,
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
) -> TokenResponse:
    """Rotates refresh token and returns a fresh Access/Refresh token pair."""
    auth_service = AuthenticationService(db, jwt_engine)
    return auth_service.refresh_tokens(payload.refresh_token)


@router.get(
    "/me",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
    summary="Get authenticated user profile details",
)
def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserRead:
    """Returns profile details for the currently authenticated identity."""
    return UserRead.model_validate(current_user)


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Revoke active user session and logout",
)
def logout(
    current_user: Annotated[User, Depends(get_current_user)],
    payload: Annotated[TokenPayload, Depends(get_token_payload)],
    db: Annotated[Session, Depends(get_db)],
    jwt_engine: Annotated[JWTEngine, Depends(get_jwt_engine)],
) -> dict[str, str]:
    """Terminates the current user session and revokes refresh tokens."""
    if payload.sid:
        auth_service = AuthenticationService(db, jwt_engine)
        auth_service.logout(payload.sid, current_user.id)
    return {"detail": "Successfully logged out."}