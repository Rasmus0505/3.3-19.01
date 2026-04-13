from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.api.serializers import to_admin_subtitle_settings_item
from app.core.config import LESSON_DEFAULT_ASR_MODEL
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.schemas import (
    AdminSubtitleSettingsHistoryResponse,
    AdminSubtitleSettingsResponse,
    AdminSubtitleSettingsUpdateRequest,
    ErrorResponse,
)
from app.services.billing import append_admin_operation_log, get_subtitle_settings, list_admin_rates

from .shared import load_subtitle_settings_rollback_candidate, subtitle_settings_item_with_meta


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get(
    "/subtitle-settings",
    response_model=AdminSubtitleSettingsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_get_subtitle_settings(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    settings = get_subtitle_settings(db)
    updated_by_user_email = None
    if settings.updated_by_user_id:
        updated_by_user = db.get(User, settings.updated_by_user_id)
        updated_by_user_email = updated_by_user.email if updated_by_user is not None else None
    return AdminSubtitleSettingsResponse(ok=True, settings=subtitle_settings_item_with_meta(settings, updated_by_user_email=updated_by_user_email))


@router.get(
    "/subtitle-settings/history",
    response_model=AdminSubtitleSettingsHistoryResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_get_subtitle_settings_history(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    settings = get_subtitle_settings(db)
    updated_by_user_email = None
    if settings.updated_by_user_id:
        updated_by_user = db.get(User, settings.updated_by_user_id)
        updated_by_user_email = updated_by_user.email if updated_by_user is not None else None
    return AdminSubtitleSettingsHistoryResponse(
        ok=True,
        current=subtitle_settings_item_with_meta(settings, updated_by_user_email=updated_by_user_email),
        rollback_candidate=load_subtitle_settings_rollback_candidate(db),
    )


@router.put(
    "/subtitle-settings",
    response_model=AdminSubtitleSettingsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_update_subtitle_settings(
    payload: AdminSubtitleSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    settings = get_subtitle_settings(db)
    normalized_default_asr_model = payload.default_asr_model.strip() or str(getattr(settings, "default_asr_model", "") or LESSON_DEFAULT_ASR_MODEL)
    available_asr_models = {
        str(item.model_name or "").strip()
        for item in list_admin_rates(db)
        if str(getattr(item, "billing_unit", "minute") or "minute") == "minute"
    }
    if normalized_default_asr_model not in available_asr_models:
        return error_response(400, "INVALID_DEFAULT_ASR_MODEL", "默认 ASR 模型不在当前可用模型列表内", normalized_default_asr_model)
    before = to_admin_subtitle_settings_item(settings).model_dump(mode="json")
    settings.default_asr_model = normalized_default_asr_model
    settings.subtitle_split_enabled = payload.subtitle_split_enabled
    settings.subtitle_split_target_words = payload.subtitle_split_target_words
    settings.subtitle_split_max_words = payload.subtitle_split_max_words
    if payload.translation_batch_max_chars is not None:
        settings.translation_batch_max_chars = payload.translation_batch_max_chars
    settings.updated_by_user_id = current_admin.id
    db.add(settings)
    db.flush()
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="subtitle_settings_update",
        target_type="subtitle_settings",
        target_id=str(getattr(settings, "id", 1)),
        before_value=before,
        after_value=to_admin_subtitle_settings_item(settings).model_dump(mode="json"),
        note="subtitle_settings",
    )
    db.commit()
    db.refresh(settings)
    return AdminSubtitleSettingsResponse(ok=True, settings=subtitle_settings_item_with_meta(settings, updated_by_user_email=current_admin.email))


@router.post(
    "/subtitle-settings/rollback-last",
    response_model=AdminSubtitleSettingsResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_rollback_subtitle_settings_last(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    rollback_candidate = load_subtitle_settings_rollback_candidate(db)
    if rollback_candidate is None:
        return error_response(400, "SUBTITLE_SETTINGS_ROLLBACK_EMPTY", "暂无可回滚的上一版本")

    settings = get_subtitle_settings(db)
    before = subtitle_settings_item_with_meta(settings).model_dump(mode="json")
    previous = rollback_candidate.settings
    settings.default_asr_model = previous.default_asr_model
    settings.subtitle_split_enabled = previous.subtitle_split_enabled
    settings.subtitle_split_target_words = previous.subtitle_split_target_words
    settings.subtitle_split_max_words = previous.subtitle_split_max_words
    settings.translation_batch_max_chars = previous.translation_batch_max_chars
    settings.updated_by_user_id = current_admin.id
    db.add(settings)
    db.flush()
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="subtitle_settings_rollback",
        target_type="subtitle_settings",
        target_id=str(getattr(settings, "id", 1)),
        before_value=before,
        after_value=subtitle_settings_item_with_meta(settings, updated_by_user_email=current_admin.email).model_dump(mode="json"),
        note=f"subtitle_settings_rollback_from:{rollback_candidate.action_id}",
    )
    db.commit()
    db.refresh(settings)
    return AdminSubtitleSettingsResponse(ok=True, settings=subtitle_settings_item_with_meta(settings, updated_by_user_email=current_admin.email))
