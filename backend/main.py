"""FastAPI application entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.exception_handlers import register_security_exception_handlers
from app.core.logging_config import setup_logging
from app.db.session import engine
from app.middlewares.security import SecurityHeadersMiddleware
from app.middlewares.timing import ProcessTimingMiddleware

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s (v%s)", settings.PROJECT_NAME, settings.VERSION)
    logger.info("Database backend: %s", engine.url.get_backend_name())
    # Production schema is managed exclusively by Alembic migrations.
    # The Render start command runs "alembic upgrade head" before uvicorn starts,
    # so startup does not race schema creation or silently drift from migrations.
    logger.info("Database schema is managed by Alembic migrations")
    yield
    logger.info("Shutting down %s", settings.PROJECT_NAME)
    engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(ProcessTimingMiddleware)
app.include_router(api_router, prefix=settings.API_V1_STR)
register_security_exception_handlers(app)

# NUVYRA uses Bearer tokens rather than browser cookies. Keep browser
# origins explicit while allowing Render/custom domains through CORS_ORIGINS.
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in settings.CORS_ORIGINS.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Render assigns a hostname per service. The frontend's actual *.onrender.com
    # hostname can differ from an older hard-coded hostname in the dashboard or
    # render.yaml. Allow HTTPS Render service origins while keeping arbitrary
    # origins and credentialed cross-site requests blocked.
    allow_origin_regex=r"^https://[a-z0-9-]+\.onrender\.com$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "running",
        "docs": "/docs",
        "api_prefix": settings.API_V1_STR,
    }


@app.get("/health", tags=["Health"])
def health_root():
    return {"status": "healthy", "service": settings.PROJECT_NAME, "version": settings.VERSION}


@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
def health_api():
    return {"status": "healthy", "service": settings.PROJECT_NAME, "version": settings.VERSION}
