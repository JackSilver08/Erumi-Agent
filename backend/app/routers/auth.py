from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user, get_db
from app.models import User

router = APIRouter()


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    created_at: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Mật khẩu tối thiểu 6 ký tự")
    display_name: str = Field(..., min_length=2, max_length=120, description="Tên người dùng")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=6)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db),
) -> AuthResponse:
    # Check if email already exists
    existing = await session.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.",
        )

    user = User(
        id=uuid.uuid4(),
        email=payload.email.lower(),
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role="user",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    token = create_access_token({"sub": user.email, "user_id": str(user.id)})

    return AuthResponse(
        access_token=token,
        user=UserRead(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            created_at=user.created_at.isoformat() if user.created_at else datetime.now(timezone.utc).isoformat(),
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> AuthResponse:
    user = await session.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác.",
        )

    token = create_access_token({"sub": user.email, "user_id": str(user.id)})

    return AuthResponse(
        access_token=token,
        user=UserRead(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            created_at=user.created_at.isoformat() if user.created_at else "",
        ),
    )


@router.get("/me", response_model=UserRead)
async def me(
    current_user: User = Depends(get_current_user),
) -> UserRead:
    return UserRead(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
        created_at=current_user.created_at.isoformat() if current_user.created_at else "",
    )


@router.put("/profile", response_model=UserRead)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UserRead:
    if payload.display_name:
        current_user.display_name = payload.display_name.strip()

    if payload.new_password:
        if not payload.current_password or not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu hiện tại không đúng.",
            )
        current_user.password_hash = hash_password(payload.new_password)

    current_user.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(current_user)

    return UserRead(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
        created_at=current_user.created_at.isoformat() if current_user.created_at else "",
    )


@router.post("/logout")
async def logout() -> dict[str, str]:
    return {"status": "success", "message": "Đã đăng xuất thành công."}
