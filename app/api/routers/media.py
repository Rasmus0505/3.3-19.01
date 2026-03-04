from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers._helpers import require_lesson_owner
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.repositories.lessons import get_sentence
from app.repositories.media_assets import get_media_asset_for_lesson
from app.schemas import ErrorResponse


router = APIRouter(prefix="/api/lessons", tags=["media"])


@router.get(
    "/{lesson_id}/media",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_lesson_media(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_lesson_owner(db, lesson_id, current_user.id)
    media_asset = get_media_asset_for_lesson(db, lesson_id)
    if not media_asset:
        return error_response(404, "MEDIA_NOT_FOUND", "课程媒体不存在")

    media_path = Path(media_asset.original_path)
    if not media_path.exists():
        return error_response(404, "MEDIA_FILE_MISSING", "课程媒体文件不存在")

    media_type = mimetypes.guess_type(str(media_path))[0] or "application/octet-stream"
    return FileResponse(path=str(media_path), media_type=media_type, filename=media_path.name)


@router.get(
    "/{lesson_id}/sentences/{idx}/audio",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_sentence_audio(
    lesson_id: int,
    idx: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_lesson_owner(db, lesson_id, current_user.id)
    sentence = get_sentence(db, lesson_id, idx)
    if not sentence:
        return error_response(404, "SENTENCE_NOT_FOUND", "句子不存在")
    clip_path = Path(sentence.audio_clip_path)
    if not clip_path.exists():
        return error_response(404, "AUDIO_CLIP_MISSING", "句级音频不存在")
    return FileResponse(path=str(clip_path), media_type="audio/ogg")
