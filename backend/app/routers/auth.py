from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from jose import jwt
from pydantic import BaseModel, EmailStr

from app.core.config import settings

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest) -> TokenResponse:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": payload.email, "exp": expires_at},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return TokenResponse(access_token=token)


@router.get("/me")
async def me() -> dict[str, str]:
    return {
        "id": "local-user",
        "email": "local@erumi.dev",
        "display_name": "Local Erumi User",
    }
