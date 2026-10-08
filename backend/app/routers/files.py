from fastapi import APIRouter, File, UploadFile

router = APIRouter()


@router.post("")
async def upload_file(file: UploadFile = File(...)) -> dict[str, object]:
    return {
        "id": "file_local_preview",
        "filename": file.filename,
        "content_type": file.content_type,
        "status": "metadata-only",
    }


@router.get("")
async def list_files() -> dict[str, list[object]]:
    return {"items": []}
