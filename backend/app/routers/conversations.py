import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.conversations import (
    ConversationCreate,
    ConversationRead,
    ConversationSummary,
)
from app.services.chat_service import (
    create_chat,
    delete_chat,
    get_chat,
    list_chats,
    update_chat_title,
)

router = APIRouter()


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ConversationRead:
    chat = await create_chat(session, user, title=payload.title)
    await session.commit()
    # Reload with selectinload to prevent MissingGreenlet in async sqlalchemy
    chat = await get_chat(session, user, chat.id)
    return ConversationRead.model_validate(chat, from_attributes=True)


@router.get("", response_model=list[ConversationSummary])
async def get_conversations(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[ConversationSummary]:
    chats = await list_chats(session, user)
    return [
        ConversationSummary.model_validate(chat, from_attributes=True)
        for chat in chats
    ]


@router.get("/{chat_id}", response_model=ConversationRead)
async def get_conversation(
    chat_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ConversationRead:
    chat = await get_chat(session, user, chat_id)
    return ConversationRead.model_validate(chat, from_attributes=True)


@router.patch("/{chat_id}", response_model=ConversationSummary)
async def update_conversation(
    chat_id: uuid.UUID,
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ConversationSummary:
    chat = await update_chat_title(session, user, chat_id, payload.title)
    return ConversationSummary.model_validate(chat, from_attributes=True)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation_route(
    chat_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await delete_chat(session, user, chat_id)
    return None
