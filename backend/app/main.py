from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.realtime.router import router as realtime_router
from app.routers import agents, auth, chat, files, health, models


def create_app() -> FastAPI:
    app = FastAPI(
        title="Erumi Agent API",
        version="0.1.0",
        description="FastAPI backend for Erumi fast chat, RAG, and Agent runs.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
    app.include_router(files.router, prefix="/api/v1/files", tags=["files"])
    app.include_router(models.router, prefix="/api/v1/models", tags=["models"])
    app.include_router(agents.router, prefix="/api/v1", tags=["agents"])
    app.include_router(realtime_router)

    return app


app = create_app()
