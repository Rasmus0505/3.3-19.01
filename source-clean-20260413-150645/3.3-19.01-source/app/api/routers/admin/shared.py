from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import to_admin_subtitle_settings_item
from app.core.config import (
    LESSON_DEFAULT_ASR_MODEL,
    REDEEM_CODE_DEFAULT_DAILY_LIMIT,
    get_redeem_code_export_confirm_text,
    is_production_environment,
    is_weak_confirm_text,
)
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.models import AdminOperationLog, RedeemCode, RedeemCodeBatch, SubtitleSetting, User
from app.schemas import AdminRedeemBatchItem, AdminSubtitleSettingsHistoryItem, AdminSubtitleSettingsItem


def now() -> datetime:
    return now_shanghai_naive()


def parse_optional_lesson_id(raw_value: str | int | None):
    text_value = str(raw_value or "").strip()
    if not text_value:
        return None, None
    if not text_value.isdigit():
        return None, error_response(400, "INVALID_LESSON_ID", "lesson_id 必须是正整数")
    lesson_id = int(text_value)
    if lesson_id <= 0:
        return None, error_response(400, "INVALID_LESSON_ID", "lesson_id 必须是正整数")
    return lesson_id, None


def effective_batch_status(*, status: str, expire_at: datetime, now_value: datetime) -> str:
    expire_at_naive = to_shanghai_naive(expire_at) or expire_at
    if status == "expired" or now_value >= expire_at_naive:
        return "expired"
    return status


def effective_code_status(*, code_status: str, batch_status: str, expire_at: datetime, now_value: datetime) -> str:
    expire_at_naive = to_shanghai_naive(expire_at) or expire_at
    if code_status == "redeemed":
        return "redeemed"
    if code_status == "abandoned":
        return "abandoned"
    if code_status == "disabled" or batch_status == "paused":
        return "disabled"
    if batch_status == "expired" or now_value >= expire_at_naive:
        return "expired"
    return "unredeemed"


def export_confirm_text() -> str:
    return get_redeem_code_export_confirm_text()


def require_export_protection_ready():
    confirm_text = export_confirm_text()
    if is_production_environment() and is_weak_confirm_text(confirm_text):
        return error_response(
            503,
            "EXPORT_CONFIRM_NOT_CONFIGURED",
            "生产环境尚未配置强导出确认词",
            "请在 Zeabur 环境变量里把 REDEEM_CODE_EXPORT_CONFIRM_TEXT 设置为一个强随机短语",
        )
    return None


def subtitle_settings_item_with_meta(
    settings: SubtitleSetting,
    *,
    updated_by_user_email: str | None = None,
) -> AdminSubtitleSettingsItem:
    item = to_admin_subtitle_settings_item(settings)
    return item.model_copy(
        update={
            "updated_by_user_id": settings.updated_by_user_id,
            "updated_by_user_email": updated_by_user_email,
        }
    )


def subtitle_settings_item_from_dict(
    payload: dict[str, object],
    *,
    updated_at: datetime,
    updated_by_user_id: int | None = None,
    updated_by_user_email: str | None = None,
) -> AdminSubtitleSettingsItem:
    return AdminSubtitleSettingsItem(
        default_asr_model=str(payload.get("default_asr_model") or LESSON_DEFAULT_ASR_MODEL),
        subtitle_split_enabled=bool(payload.get("subtitle_split_enabled", True)),
        subtitle_split_target_words=int(payload.get("subtitle_split_target_words", 18) or 18),
        subtitle_split_max_words=int(payload.get("subtitle_split_max_words", 28) or 28),
        translation_batch_max_chars=max(1, min(12000, int(payload.get("translation_batch_max_chars", 2600) or 2600))),
        updated_at=to_shanghai_aware(updated_at),
        updated_by_user_id=updated_by_user_id,
        updated_by_user_email=updated_by_user_email,
    )


def load_subtitle_settings_rollback_candidate(db: Session) -> AdminSubtitleSettingsHistoryItem | None:
    operator_user = User.__table__.alias("subtitle_settings_operator")
    row = db.execute(
        select(AdminOperationLog, operator_user.c.email.label("operator_email"))
        .outerjoin(operator_user, operator_user.c.id == AdminOperationLog.operator_user_id)
        .where(
            AdminOperationLog.target_type == "subtitle_settings",
            AdminOperationLog.action_type.in_(["subtitle_settings_update", "subtitle_settings_rollback"]),
        )
        .order_by(AdminOperationLog.created_at.desc(), AdminOperationLog.id.desc())
        .limit(1)
    ).first()
    if row is None:
        return None

    raw_before = getattr(row[0], "before_value", "") or ""
    try:
        payload = json.loads(raw_before)
    except Exception:
        payload = {}
    if not isinstance(payload, dict) or not payload:
        return None

    return AdminSubtitleSettingsHistoryItem(
        action_id=int(row[0].id),
        created_at=to_shanghai_aware(row[0].created_at),
        operator_user_id=row[0].operator_user_id,
        operator_user_email=row.operator_email,
        settings=subtitle_settings_item_from_dict(
            payload,
            updated_at=row[0].created_at,
            updated_by_user_id=row[0].operator_user_id,
            updated_by_user_email=row.operator_email,
        ),
    )


def to_batch_item(batch: RedeemCodeBatch, redeemed_count: int, *, now_value: datetime) -> AdminRedeemBatchItem:
    generated_count = int(batch.generated_count)
    redeemed_count = int(max(0, redeemed_count))
    remaining_count = max(0, generated_count - redeemed_count)
    redeem_rate = round((redeemed_count / generated_count) if generated_count > 0 else 0.0, 4)
    total_issued_points = generated_count * int(batch.face_value_points)
    total_redeemed_points = redeemed_count * int(batch.face_value_points)
    effective_daily_limit = int(batch.daily_limit_per_user or REDEEM_CODE_DEFAULT_DAILY_LIMIT)

    return AdminRedeemBatchItem(
        id=batch.id,
        batch_name=batch.batch_name,
        face_value_points=int(batch.face_value_points),
        generated_count=generated_count,
        redeemed_count=redeemed_count,
        remaining_count=remaining_count,
        redeem_rate=redeem_rate,
        total_issued_points=total_issued_points,
        total_redeemed_points=total_redeemed_points,
        status=effective_batch_status(status=batch.status, expire_at=batch.expire_at, now_value=now_value),
        active_from=to_shanghai_aware(batch.active_from),
        expire_at=to_shanghai_aware(batch.expire_at),
        daily_limit_per_user=batch.daily_limit_per_user,
        effective_daily_limit=effective_daily_limit,
        remark=batch.remark,
        created_by_user_id=batch.created_by_user_id,
        created_at=to_shanghai_aware(batch.created_at),
        updated_at=to_shanghai_aware(batch.updated_at),
    )


def count_redeemed_codes(db: Session, batch_id: int) -> int:
    return int(db.scalar(select(func.count(RedeemCode.id)).where(RedeemCode.batch_id == batch_id, RedeemCode.status == "redeemed")) or 0)
