from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("")
async def list_models() -> dict[str, list[dict[str, str]]]:
    return {
        "items": [
            {
                "id": settings.default_model,
                "name": "Erumi Auto",
                "path": "fast-chat",
            },
            {
                "id": "agent-deep",
                "name": "Agent Deep",
                "path": "agent",
            },
        ]
    }
