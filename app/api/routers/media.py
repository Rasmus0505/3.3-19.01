from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.lessons.helpers import require_lesson_owner
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.repositories.lessons import get_sentence
from app.repositories.media_assets import get_media_asset_for_lesson
from app.schemas import ErrorResponse
from app.services.media import MediaError, resolve_controlled_media_path


router = APIRouter(prefix="/api/lessons", tags=["media"])
logger = logging.getLogger(__name__)
LOCAL_MEDIA_REQUIRED_MESSAGE = "该课程仅支持本地绑定媒体，请先在浏览器绑定本地文件"


def local_media_required_response():
    return error_response(409, "LOCAL_MEDIA_REQUIRED", LOCAL_MEDIA_REQUIRED_MESSAGE)


def invalid_media_path_response():
    return error_response(404, "MEDIA_PATH_INVALID", "课程媒体路径无效")


def resolve_media_type(source_filename: str, media_path: Path) -> str:
    from_filename = mimetypes.guess_type(source_filename or "")[0]
    if from_filename:
        return from_filename
    from_path = mimetypes.guess_type(str(media_path))[0]
    if from_path:
        return from_path
    return "application/octet-stream"


@router.get(
    "/{lesson_id}/media",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def get_lesson_media(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    if lesson.media_storage == "client_indexeddb":
        logger.info("[DEBUG] media.main local_required lesson_id=%s", lesson_id)
        return local_media_required_response()

    media_asset = get_media_asset_for_lesson(db, lesson_id)
    if not media_asset:
        return error_response(404, "MEDIA_NOT_FOUND", "课程媒体不存在")

    try:
        media_path = resolve_controlled_media_path(media_asset.original_path, field_name="media_asset.original_path")
    except MediaError as exc:
        logger.warning("[DEBUG] media.main invalid_path lesson_id=%s detail=%s", lesson_id, exc.detail or exc.message)
        return invalid_media_path_response()
    if not media_path.exists():
        return error_response(404, "MEDIA_FILE_MISSING", "课程媒体文件不存在")

    media_type = resolve_media_type(lesson.source_filename, media_path)
    return FileResponse(path=str(media_path), media_type=media_type, filename=media_path.name)


@router.get(
    "/{lesson_id}/sentences/{idx}/audio",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def get_sentence_audio(
    lesson_id: int,
    idx: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = require_lesson_owner(db, lesson_id, current_user.id)
    sentence = get_sentence(db, lesson_id, idx)
    if not sentence:
        return error_response(404, "SENTENCE_NOT_FOUND", "句子不存在")

    if lesson.media_storage == "client_indexeddb":
        if not sentence.audio_clip_path:
            logger.info("[DEBUG] media.clip local_required lesson_id=%s idx=%s", lesson_id, idx)
            return local_media_required_response()
        try:
            clip_path = resolve_controlled_media_path(sentence.audio_clip_path, field_name="lesson_sentence.audio_clip_path")
        except MediaError as exc:
            logger.warning("[DEBUG] media.clip invalid_path lesson_id=%s idx=%s detail=%s", lesson_id, idx, exc.detail or exc.message)
            return local_media_required_response()
        if not clip_path.exists():
            logger.info("[DEBUG] media.clip local_required_missing_file lesson_id=%s idx=%s", lesson_id, idx)
            return local_media_required_response()
        return FileResponse(path=str(clip_path), media_type="audio/ogg")

    if not sentence.audio_clip_path:
        return error_response(404, "AUDIO_CLIP_MISSING", "句级音频不存在")

    try:
        clip_path = resolve_controlled_media_path(sentence.audio_clip_path, field_name="lesson_sentence.audio_clip_path")
    except MediaError as exc:
        logger.warning("[DEBUG] media.clip invalid_path lesson_id=%s idx=%s detail=%s", lesson_id, idx, exc.detail or exc.message)
        return invalid_media_path_response()
    if not clip_path.exists():
        return error_response(404, "AUDIO_CLIP_MISSING", "句级音频不存在")
    return FileResponse(path=str(clip_path), media_type="audio/ogg")
