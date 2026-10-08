from collections.abc import AsyncGenerator

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.models import User
from app.services.chat_service import ensure_user


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    # 1. If Bearer token is provided, authenticate against database
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
            ) from exc

        email = payload.get("sub")
        if not isinstance(email, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token không chứa thông tin định danh.",
            )

        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tài khoản không tồn tại.",
            )
        return user

    # 2. If no token provided but dev bypass is enabled, use default guest user
    if settings.dev_auth_bypass:
        return await ensure_user(
            session,
            email="local@erumi.dev",
            display_name="Local Erumi User",
        )

    # 3. Otherwise require authentication
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Vui lòng đăng nhập để tiếp tục.",
    )
