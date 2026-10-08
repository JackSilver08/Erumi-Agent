from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    title: str = Field(default="New chat", max_length=240)


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    status: str
    model_id: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: str
    created_at: datetime
    updated_at: datetime | None = None


class ConversationRead(ConversationSummary):
    messages: list[MessageRead]
