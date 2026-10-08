from datetime import datetime, timezone
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Chat, Message, User


def make_title(content: str) -> str:
    normalized = " ".join(content.strip().split())
    if not normalized:
        return "New chat"
    return normalized[:72] + ("…" if len(normalized) > 72 else "")


async def ensure_user(
    session: AsyncSession,
    *,
    email: str,
    display_name: str,
) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user is not None:
        return user

    user = User(
        id=uuid.uuid4(),
        email=email,
        display_name=display_name,
        password_hash="dev-only",
        role="user",
    )
    session.add(user)
    await session.flush()
    return user


async def create_chat(
    session: AsyncSession,
    user: User,
    *,
    title: str = "New chat",
) -> Chat:
    chat = Chat(
        id=uuid.uuid4(),
        user_id=user.id,
        title=title.strip() or "New chat",
        status="active",
        metadata_json={},
    )
    session.add(chat)
    await session.flush()
    return chat


async def get_chat(
    session: AsyncSession,
    user: User,
    chat_id: uuid.UUID,
) -> Chat:
    query = (
        select(Chat)
        .where(Chat.id == chat_id, Chat.user_id == user.id)
        .options(selectinload(Chat.messages))
    )
    chat = await session.scalar(query)
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    chat.messages.sort(key=lambda message: message.created_at or datetime.min.replace(tzinfo=timezone.utc))
    return chat


async def list_chats(
    session: AsyncSession,
    user: User,
) -> list[Chat]:
    query = (
        select(Chat)
        .where(Chat.user_id == user.id)
        .order_by(Chat.updated_at.desc().nullslast(), Chat.created_at.desc())
    )
    return list((await session.scalars(query)).all())


async def add_message(
    session: AsyncSession,
    chat: Chat,
    *,
    role: str,
    content: str,
    status: str = "completed",
    model_id: str | None = None,
    metadata: dict | None = None,
) -> Message:
    message = Message(
        id=uuid.uuid4(),
        chat_id=chat.id,
        role=role,
        content=content,
        status=status,
        model_id=model_id,
        metadata_json=metadata or {},
        completed_at=datetime.now(timezone.utc) if status == "completed" else None,
    )
    session.add(message)
    chat.messages.append(message)
    return message
