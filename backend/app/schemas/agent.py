from pydantic import BaseModel


class AgentRunCreate(BaseModel):
    goal: str
    chat_id: str | None = None
    require_approval: bool = False


class AgentRunRead(BaseModel):
    id: str
    status: str
    goal: str
    next_action: str | None = None
