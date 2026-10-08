from fastapi import APIRouter
from redis.asyncio import Redis

from app.core.config import settings
from app.core.database import check_database

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready() -> dict[str, object]:
    dependencies: dict[str, str] = {}
    status = "ready"

    try:
        await check_database()
        dependencies["database"] = "ok"
    except Exception:
        dependencies["database"] = "error"
        status = "not_ready"

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.ping()
        dependencies["redis"] = "ok"
    except Exception:
        dependencies["redis"] = "error"
        status = "not_ready"
    finally:
        await redis.aclose()

    return {"status": status, "dependencies": dependencies}


@router.get("/version")
async def version() -> dict[str, str]:
    return {"name": "erumi-api", "version": "0.1.0"}
