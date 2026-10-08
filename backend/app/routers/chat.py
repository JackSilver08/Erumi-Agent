from datetime import datetime, timezone
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies import get_current_user, get_db
from app.models import Message, User
from app.schemas.chat import ChatCompletionRequest
from app.services.chat_service import add_message, create_chat, get_chat, make_title
from app.services.model_router import stream_chat_response

router = APIRouter()


def sse_event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def prepare_chat(
    payload: ChatCompletionRequest,
    user: User,
    session: AsyncSession,
):
    if payload.conversation_id:
        chat_id = uuid.UUID(payload.conversation_id)
        chat = await get_chat(session, user, chat_id)
    else:
        first_user_message = next(
            (message.content for message in payload.messages if message.role == "user"),
            "",
        )
        chat = await create_chat(
            session,
            user,
            title=make_title(first_user_message),
        )

    user_message = next(
        (message for message in reversed(payload.messages) if message.role == "user"),
        None,
    )
    if user_message is not None:
        await add_message(
            session,
            chat,
            role="user",
            content=user_message.content,
            status="completed",
        )
    return chat


async def get_model_messages(
    session: AsyncSession,
    chat_id: uuid.UUID,
    payload: ChatCompletionRequest,
) -> list[dict[str, str]]:
    stmt = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc())
    )
    result = await session.scalars(stmt)
    db_messages = list(result.all())
    if db_messages:
        return [
            {"role": message.role, "content": message.content}
            for message in db_messages
            if message.role in {"system", "user", "assistant"}
        ]
    return [
        {"role": message.role, "content": message.content}
        for message in payload.messages
        if message.role in {"system", "user", "assistant"}
    ]


@router.post("/completions")
async def completions(
    payload: ChatCompletionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    chat = await prepare_chat(payload, user, session)
    chat_id = chat.id
    messages = await get_model_messages(session, chat_id, payload)
    await session.commit()

    if not payload.stream:
        chunks = [
            chunk async for chunk in stream_chat_response(
                messages=messages,
                model=payload.model,
            )
        ]
        answer = "".join(chunks)
        assistant_message = Message(
            id=uuid.uuid4(),
            chat_id=chat_id,
            role="assistant",
            content=answer,
            status="completed",
            model_id=payload.model,
            metadata_json={},
            completed_at=datetime.now(timezone.utc),
        )
        session.add(assistant_message)
        await session.commit()
        return JSONResponse(
            {
                "type": "message",
                "content": answer,
                "model": payload.model,
                "conversation_id": str(chat_id),
            }
        )

    async def event_stream() -> AsyncIterator[str]:
        answer = ""
        try:
            yield sse_event(
                {
                    "type": "metadata",
                    "model": payload.model,
                    "conversation_id": str(chat_id),
                }
            )
            async for token in stream_chat_response(
                messages=messages,
                model=payload.model,
            ):
                answer += token
                yield sse_event({"type": "token", "content": token})

            # Save assistant message using a clean dedicated session
            async for sess in get_session():
                msg = Message(
                    id=uuid.uuid4(),
                    chat_id=chat_id,
                    role="assistant",
                    content=answer,
                    status="completed",
                    model_id=payload.model,
                    metadata_json={},
                    completed_at=datetime.now(timezone.utc),
                )
                sess.add(msg)
                await sess.commit()
                break

            yield sse_event({"type": "done"})
        except Exception as exc:
            yield sse_event(
                {
                    "type": "error",
                    "message": str(exc),
                }
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
