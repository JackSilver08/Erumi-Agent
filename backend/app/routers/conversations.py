import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.conversations import (
    ConversationCreate,
    ConversationRead,
    ConversationSummary,
)
from app.services.chat_service import create_chat, get_chat, list_chats

router = APIRouter()


@router.post("", response_model=ConversationRead, status_code=201)
async def create_conversation(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ConversationRead:
    chat = await create_chat(session, user, title=payload.title)
    await session.commit()
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
