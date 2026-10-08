from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant|tool)$")
    content: str


class ChatCompletionRequest(BaseModel):
    conversation_id: str | None = None
    model: str = "erumi-auto"
    messages: list[ChatMessage]
    stream: bool = True


class ChatCompletionResponse(BaseModel):
    type: str
    content: str | None = None
    model: str | None = None
