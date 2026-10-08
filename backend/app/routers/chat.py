import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import User
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


def model_messages(chat) -> list[dict[str, str]]:
    return [
        {"role": message.role, "content": message.content}
        for message in chat.messages
        if message.role in {"system", "user", "assistant"}
    ]


@router.post("/completions")
async def completions(
    payload: ChatCompletionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    chat = await prepare_chat(payload, user, session)
    messages = model_messages(chat)
    await session.commit()

    if not payload.stream:
        chunks = [
            chunk async for chunk in stream_chat_response(
                messages=messages,
                model=payload.model,
            )
        ]
        answer = "".join(chunks)
        await add_message(
            session,
            chat,
            role="assistant",
            content=answer,
            status="completed",
            model_id=payload.model,
        )
        await session.commit()
        return JSONResponse(
            {
                "type": "message",
                "content": answer,
                "model": payload.model,
                "conversation_id": str(chat.id),
            }
        )

    async def event_stream() -> AsyncIterator[str]:
        answer = ""
        try:
            yield sse_event(
                {
                    "type": "metadata",
                    "model": payload.model,
                    "conversation_id": str(chat.id),
                }
            )
            async for token in stream_chat_response(
                messages=messages,
                model=payload.model,
            ):
                answer += token
                yield sse_event({"type": "token", "content": token})

            await add_message(
                session,
                chat,
                role="assistant",
                content=answer,
                status="completed",
                model_id=payload.model,
            )
            await session.commit()
            yield sse_event({"type": "done"})
        except Exception as exc:
            await session.rollback()
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
