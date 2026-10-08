import uuid

from fastapi import APIRouter

from app.schemas.agent import AgentRunCreate, AgentRunRead

router = APIRouter()


@router.post("/agents")
async def create_agent() -> dict[str, str]:
    return {"id": "default", "name": "Erumi Default Agent"}


@router.post("/agents/{agent_id}/runs", response_model=AgentRunRead)
async def create_run(agent_id: str, payload: AgentRunCreate) -> AgentRunRead:
    status = "waiting_approval" if payload.require_approval else "queued"
    next_action = "approve_or_reject" if payload.require_approval else "worker_pickup"
    return AgentRunRead(
        id=f"run_{uuid.uuid4().hex[:12]}",
        status=status,
        goal=payload.goal,
        next_action=next_action,
    )


@router.get("/runs/{run_id}", response_model=AgentRunRead)
async def get_run(run_id: str) -> AgentRunRead:
    return AgentRunRead(
        id=run_id,
        status="queued",
        goal="Preview run",
        next_action="worker_pickup",
    )


@router.post("/runs/{run_id}/approve")
async def approve_run(run_id: str) -> dict[str, str]:
    return {"id": run_id, "status": "approved"}


@router.post("/runs/{run_id}/reject")
async def reject_run(run_id: str) -> dict[str, str]:
    return {"id": run_id, "status": "rejected"}
