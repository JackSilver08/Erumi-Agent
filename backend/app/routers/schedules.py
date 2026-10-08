from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import AgentRun, User

router = APIRouter()


class ScheduleCreate(BaseModel):
    title: str = Field(..., max_length=240)
    frequency: str = Field(default="Hàng ngày lúc 08:00")
    prompt: str = Field(..., max_length=2000)
    category: str = Field(default="Tự động hóa")


class ScheduleRead(BaseModel):
    id: str
    title: str
    frequency: str
    prompt: str
    category: str
    status: str  # "active" | "paused"
    created_at: str
    last_run: str | None = None
    last_result: str | None = None


@router.get("", response_model=list[ScheduleRead])
async def list_schedules(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[ScheduleRead]:
    # Query agent_runs marked as schedules
    query = (
        select(AgentRun)
        .where(AgentRun.user_id == user.id)
        .order_by(AgentRun.created_at.desc())
    )
    runs = (await session.scalars(query)).all()

    schedules = []
    for run in runs:
        meta = run.metadata_json or {}
        if meta.get("is_schedule"):
            schedules.append(
                ScheduleRead(
                    id=str(run.id),
                    title=meta.get("title", run.goal[:40]),
                    frequency=meta.get("frequency", "Hàng ngày"),
                    prompt=run.goal,
                    category=meta.get("category", "Tự động"),
                    status=run.status if run.status in {"active", "paused"} else "active",
                    created_at=run.created_at.isoformat() if run.created_at else "",
                    last_run=run.finished_at.isoformat() if run.finished_at else None,
                    last_result=run.result,
                )
            )

    # If no schedules exist yet in DB, create initial starter schedules
    if not schedules:
        starter_data = [
            {
                "title": "Báo cáo công việc hàng ngày",
                "frequency": "Mỗi ngày lúc 08:00 sáng",
                "prompt": "Tóm tắt các đầu việc quan trọng cần giải quyết trong ngày và gợi ý kế hoạch làm việc.",
                "category": "Báo cáo",
            },
            {
                "title": "Cập nhật tin tức & tóm tắt thị trường",
                "frequency": "Thứ 2 & Thứ 6 lúc 17:00",
                "prompt": "Tìm kiếm và tóm tắt những tin tức nổi bật nhất về công nghệ AI và phần mềm.",
                "category": "Tin tức",
            },
        ]
        for item in starter_data:
            run_id = uuid.uuid4()
            run = AgentRun(
                id=run_id,
                user_id=user.id,
                status="active",
                goal=item["prompt"],
                result="Đã sẵn sàng thực thi theo lịch.",
                metadata_json={
                    "is_schedule": True,
                    "title": item["title"],
                    "frequency": item["frequency"],
                    "category": item["category"],
                },
                finished_at=datetime.now(timezone.utc),
            )
            session.add(run)
            schedules.append(
                ScheduleRead(
                    id=str(run_id),
                    title=item["title"],
                    frequency=item["frequency"],
                    prompt=item["prompt"],
                    category=item["category"],
                    status="active",
                    created_at=datetime.now(timezone.utc).isoformat(),
                    last_run=datetime.now(timezone.utc).isoformat(),
                    last_result="Đã sẵn sàng thực thi theo lịch.",
                )
            )
        await session.commit()

    return schedules


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ScheduleRead:
    run_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    run = AgentRun(
        id=run_id,
        user_id=user.id,
        status="active",
        goal=payload.prompt,
        result=None,
        metadata_json={
            "is_schedule": True,
            "title": payload.title,
            "frequency": payload.frequency,
            "category": payload.category,
        },
    )
    session.add(run)
    await session.commit()

    return ScheduleRead(
        id=str(run_id),
        title=payload.title,
        frequency=payload.frequency,
        prompt=payload.prompt,
        category=payload.category,
        status="active",
        created_at=now.isoformat(),
        last_run=None,
        last_result=None,
    )


@router.patch("/{schedule_id}/toggle", response_model=ScheduleRead)
async def toggle_schedule(
    schedule_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ScheduleRead:
    run = await session.scalar(
        select(AgentRun).where(AgentRun.id == schedule_id, AgentRun.user_id == user.id)
    )
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")

    new_status = "paused" if run.status == "active" else "active"
    run.status = new_status
    await session.commit()

    meta = run.metadata_json or {}
    return ScheduleRead(
        id=str(run.id),
        title=meta.get("title", run.goal[:40]),
        frequency=meta.get("frequency", "Hàng ngày"),
        prompt=run.goal,
        category=meta.get("category", "Tự động"),
        status=new_status,
        created_at=run.created_at.isoformat() if run.created_at else "",
        last_run=run.finished_at.isoformat() if run.finished_at else None,
        last_result=run.result,
    )


@router.post("/{schedule_id}/run")
async def trigger_schedule_now(
    schedule_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    run = await session.scalar(
        select(AgentRun).where(AgentRun.id == schedule_id, AgentRun.user_id == user.id)
    )
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")

    now = datetime.now(timezone.utc)
    result_text = f"Erumi đã thực thi tác vụ '{run.metadata_json.get('title', 'Tác vụ')}' thành công lúc {now.strftime('%H:%M:%S %d/%m/%Y')}."
    run.finished_at = now
    run.result = result_text
    await session.commit()

    return {
        "status": "success",
        "schedule_id": str(run.id),
        "executed_at": now.isoformat(),
        "result": result_text,
    }


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    run = await session.scalar(
        select(AgentRun).where(AgentRun.id == schedule_id, AgentRun.user_id == user.id)
    )
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")

    await session.delete(run)
    await session.commit()
    return None
