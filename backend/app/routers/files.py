from datetime import datetime, timezone
import os
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import Document, User

router = APIRouter()

UPLOAD_DIR = Path("storage/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def extract_preview(content_bytes: bytes, filename: str) -> str:
    """Extract a quick text preview for documents and text files."""
    try:
        ext = os.path.splitext(filename)[1].lower()
        if ext in {".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".html", ".css", ".xml", ".yaml", ".yml"}:
            text = content_bytes.decode("utf-8", errors="replace")
            return text[:4000]
        elif ext in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            return f"[Hình ảnh: {filename}]"
        else:
            return f"[Tệp tin đính kèm: {filename}]"
    except Exception:
        return f"[Tệp tin: {filename}]"


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    content = await file.read()
    file_id = uuid.uuid4()
    safe_filename = file.filename or f"file_{file_id.hex[:8]}"
    
    # Save to disk
    file_path = UPLOAD_DIR / f"{file_id}_{safe_filename}"
    file_path.write_bytes(content)

    preview_text = extract_preview(content, safe_filename)

    # Save to Document table
    doc = Document(
        id=file_id,
        owner_id=user.id,
        title=safe_filename,
        source_uri=str(file_path),
        mime_type=file.content_type or "application/octet-stream",
        metadata_json={
            "size_bytes": len(content),
            "preview_text": preview_text,
            "filename": safe_filename,
        },
    )
    session.add(doc)
    await session.commit()

    return {
        "id": str(doc.id),
        "filename": doc.title,
        "content_type": doc.mime_type,
        "size_bytes": len(content),
        "preview": preview_text[:300],
        "created_at": doc.created_at.isoformat() if doc.created_at else datetime.now(timezone.utc).isoformat(),
        "status": "ready",
    }


@router.get("")
async def list_files(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    query = (
        select(Document)
        .where(Document.owner_id == user.id)
        .order_by(Document.created_at.desc())
    )
    docs = (await session.scalars(query)).all()

    items = []
    for doc in docs:
        meta = doc.metadata_json or {}
        items.append({
            "id": str(doc.id),
            "filename": doc.title,
            "content_type": doc.mime_type or "application/octet-stream",
            "size_bytes": meta.get("size_bytes", 0),
            "preview": meta.get("preview_text", "")[:300],
            "created_at": doc.created_at.isoformat() if doc.created_at else "",
            "status": "ready",
        })

    return {"items": items}


@router.get("/{file_id}")
async def get_file_detail(
    file_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    doc = await session.scalar(
        select(Document).where(Document.id == file_id, Document.owner_id == user.id)
    )
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    meta = doc.metadata_json or {}
    return {
        "id": str(doc.id),
        "filename": doc.title,
        "content_type": doc.mime_type,
        "size_bytes": meta.get("size_bytes", 0),
        "content": meta.get("preview_text", ""),
        "created_at": doc.created_at.isoformat() if doc.created_at else "",
    }


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    doc = await session.scalar(
        select(Document).where(Document.id == file_id, Document.owner_id == user.id)
    )
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    # Remove physical file if exists
    if doc.source_uri:
        try:
            p = Path(doc.source_uri)
            if p.exists():
                p.unlink()
        except Exception:
            pass

    await session.delete(doc)
    await session.commit()
    return None
