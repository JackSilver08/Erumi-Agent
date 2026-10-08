from collections.abc import AsyncIterator
import asyncio

from app.core.config import settings


async def stream_chat_response(prompt: str, model: str) -> AsyncIterator[str]:
    if settings.mock_model:
        text = (
            "Erumi fast path received your request. "
            "This scaffold is streaming through SSE, with Agent tooling ready "
            "to be connected behind the router."
        )
        if prompt:
            text += f" You asked: {prompt}"
        for token in text.split(" "):
            await asyncio.sleep(0.035)
            yield token + " "
        return

    text = f"Model provider for {model} is not configured yet."
    for token in text.split(" "):
        await asyncio.sleep(0.02)
        yield token + " "
