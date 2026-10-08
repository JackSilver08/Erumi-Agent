import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from app.schemas.chat import ChatCompletionRequest
from app.services.model_router import stream_chat_response

router = APIRouter()


def sse_event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/completions")
async def completions(payload: ChatCompletionRequest):
    messages = [message.model_dump() for message in payload.messages]

    if not payload.stream:
        chunks = [
            chunk async for chunk in stream_chat_response(
                messages=messages,
                model=payload.model,
            )
        ]
        return JSONResponse(
            {
                "type": "message",
                "content": "".join(chunks),
                "model": payload.model,
            }
        )

    async def event_stream():
        yield sse_event({"type": "metadata", "model": payload.model})
        async for token in stream_chat_response(
            messages=messages,
            model=payload.model,
        ):
            yield sse_event({"type": "token", "content": token})
        yield sse_event({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
