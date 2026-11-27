"""Application configuration."""

import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "NUVYRA"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    JWT_SECRET_KEY: str = "dev-only-change-this-secret-before-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    DATABASE_URL: Optional[str] = None
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "digital_biomarker_db"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_ECHO: bool = False
    # Comma-separated browser origins allowed to call the API. Keep this
    # explicit in production instead of relying on a wildcard CORS policy.
    CORS_ORIGINS: str = "https://digital-biomarker-monitor.onrender.com"

    # SMTP is required to deliver password-reset links in production.
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_USE_TLS: bool = True
    FRONTEND_URL: str = "https://digital-biomarker-monitor.onrender.com"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """Return the configured PostgreSQL URL, or local SQLite during development.

        Production must use the externally managed Neon PostgreSQL database. A
        silent SQLite fallback would make accounts disappear after a Render
        restart and can make authentication appear intermittently broken.
        """
        database_url = os.environ.get("DATABASE_URL") or self.DATABASE_URL
        if database_url:
            url = database_url.strip()
            if url.startswith("postgres://"):
                url = "postgresql://" + url[len("postgres://"):]
            return url

        if self.ENVIRONMENT.lower() == "production":
            raise RuntimeError("DATABASE_URL is required in production. Configure the Neon PostgreSQL connection on Render.")

        return "sqlite:///./digital_biomarker.db"


settings = Settings()

if settings.ENVIRONMENT.lower() == "production" and settings.JWT_SECRET_KEY == "dev-only-change-this-secret-before-production":
    raise RuntimeError("JWT_SECRET_KEY must be configured in production.")
