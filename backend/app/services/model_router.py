import asyncio
import json
from collections.abc import AsyncIterator, Sequence

import httpx

from app.core.config import settings


async def _mock_stream(prompt: str) -> AsyncIterator[str]:
    text = (
        "Erumi fast path is running in mock mode. "
        "Set ERUMI_MOCK_MODEL=false and point ERUMI_OLLAMA_BASE_URL "
        "to a running Ollama instance to use a real model."
    )
    if prompt:
        text += f" You asked: {prompt}"
    for token in text.split():
        await asyncio.sleep(0.02)
        yield token + " "


async def stream_chat_response(
    messages: Sequence[dict[str, str]],
    model: str,
) -> AsyncIterator[str]:
    if settings.mock_model:
        prompt = messages[-1]["content"] if messages else ""
        async for token in _mock_stream(prompt):
            yield token
        return

    selected_model = settings.ollama_model if model == "erumi-auto" else model
    payload = {
        "model": selected_model,
        "messages": list(messages),
        "stream": True,
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(settings.ollama_timeout_seconds)
    ) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url.rstrip('/')}/api/chat",
            json=payload,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                if chunk.get("done"):
                    return
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield content
