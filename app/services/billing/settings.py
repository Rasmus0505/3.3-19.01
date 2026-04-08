"""字幕设置服务 - 计费模块。

提供字幕设置管理功能。

此文件是从 app/services/billing.py 中提取的字幕设置相关逻辑。
"""
from __future__ import annotations

import logging
from datetime import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import SubtitleSetting
from app.models.billing import cents_to_rate_yuan, normalize_rate_yuan as model_normalize_rate_yuan
from app.core.config import LESSON_DEFAULT_ASR_MODEL
from app.core.timezone import now_shanghai_naive
from app.services.billing.constants import DEFAULT_SUBTITLE_SETTINGS


logger = logging.getLogger(__name__)


def _now() -> datetime:
    return now_shanghai_naive()


@dataclass
class SubtitleSettingsSnapshot:
    """字幕设置快照。"""
    semantic_split_default_enabled: bool = False
    default_asr_model: str = LESSON_DEFAULT_ASR_MODEL
    subtitle_split_enabled: bool = True
    subtitle_split_target_words: int = 18
    subtitle_split_max_words: int = 40


def _ensure_subtitle_settings_schema(db: Session) -> bool:
    """确保字幕设置表结构正确。"""
    inspector = __import__("sqlalchemy").inspect(db.bind)
    tables = inspector.get_table_names()

    if "subtitle_settings" not in tables:
        return False

    columns = {c["name"] for c in inspector.get_columns("subtitle_settings")}
    required_columns = {
        "semantic_split_default_enabled",
        "default_asr_model",
        "subtitle_split_enabled",
        "subtitle_split_target_words",
        "subtitle_split_max_words",
    }

    # 如果缺少列，尝试添加
    for col in required_columns - columns:
        try:
            with db.bind.connect() as conn:
                conn.execute(text(f"ALTER TABLE subtitle_settings ADD COLUMN {col} TEXT"))
                conn.commit()
        except Exception as e:
            logger.warning("Failed to add column %s: %s", col, e)

    return True


def _backfill_subtitle_settings_values(db: Session) -> bool:
    """回填字幕设置默认值。"""
    from sqlalchemy import update

    result = db.execute(
        update(SubtitleSetting)
        .where(SubtitleSetting.semantic_split_default_enabled == None)
        .values(
            semantic_split_default_enabled=DEFAULT_SUBTITLE_SETTINGS["semantic_split_default_enabled"],
            default_asr_model=DEFAULT_SUBTITLE_SETTINGS["default_asr_model"],
            subtitle_split_enabled=DEFAULT_SUBTITLE_SETTINGS["subtitle_split_enabled"],
            subtitle_split_target_words=DEFAULT_SUBTITLE_SETTINGS["subtitle_split_target_words"],
            subtitle_split_max_words=DEFAULT_SUBTITLE_SETTINGS["subtitle_split_max_words"],
        )
    )
    db.flush()
    return result.rowcount > 0


def _normalize_subtitle_settings_row(row: SubtitleSetting) -> bool:
    """规范化字幕设置行。"""
    from sqlalchemy import update

    updates = {}
    if row.semantic_split_default_enabled is None:
        updates["semantic_split_default_enabled"] = False
    if row.default_asr_model is None:
        updates["default_asr_model"] = DEFAULT_SUBTITLE_SETTINGS["default_asr_model"]
    if row.subtitle_split_enabled is None:
        updates["subtitle_split_enabled"] = True
    if row.subtitle_split_target_words is None:
        updates["subtitle_split_target_words"] = DEFAULT_SUBTITLE_SETTINGS["subtitle_split_target_words"]
    if row.subtitle_split_max_words is None:
        updates["subtitle_split_max_words"] = DEFAULT_SUBTITLE_SETTINGS["subtitle_split_max_words"]

    if updates:
        db.execute(
            update(SubtitleSetting)
            .where(SubtitleSetting.id == row.id)
            .values(**updates)
        )
        db.flush()
        return True
    return False


def ensure_default_subtitle_settings(db: Session) -> SubtitleSetting:
    """确保默认字幕设置存在。"""
    # 确保表结构
    _ensure_subtitle_settings_schema(db)

    # 获取或创建设置
    settings = db.scalars(select(SubtitleSetting)).first()

    if settings is None:
        settings = SubtitleSetting(
            semantic_split_default_enabled=DEFAULT_SUBTITLE_SETTINGS["semantic_split_default_enabled"],
            default_asr_model=DEFAULT_SUBTITLE_SETTINGS["default_asr_model"],
            subtitle_split_enabled=DEFAULT_SUBTITLE_SETTINGS["subtitle_split_enabled"],
            subtitle_split_target_words=DEFAULT_SUBTITLE_SETTINGS["subtitle_split_target_words"],
            subtitle_split_max_words=DEFAULT_SUBTITLE_SETTINGS["subtitle_split_max_words"],
        )
        db.add(settings)
        db.flush()
    else:
        # 规范化设置
        _normalize_subtitle_settings_row(settings)
        _backfill_subtitle_settings_values(db)

    return settings


def get_subtitle_settings(db: Session) -> SubtitleSetting:
    """获取字幕设置。"""
    return ensure_default_subtitle_settings(db)


def get_subtitle_settings_snapshot(db: Session) -> SubtitleSettingsSnapshot:
    """获取字幕设置快照。"""
    settings = ensure_default_subtitle_settings(db)

    def parse_bool(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        return str(value).lower() in {"true", "1", "yes", "on"}

    def parse_int(value: Any, default: int = 0) -> int:
        if value is None:
            return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    return SubtitleSettingsSnapshot(
        semantic_split_default_enabled=parse_bool(settings.semantic_split_default_enabled),
        default_asr_model=settings.default_asr_model or DEFAULT_SUBTITLE_SETTINGS["default_asr_model"],
        subtitle_split_enabled=parse_bool(settings.subtitle_split_enabled),
        subtitle_split_target_words=parse_int(settings.subtitle_split_target_words, 18),
        subtitle_split_max_words=parse_int(settings.subtitle_split_max_words, 40),
    )


def get_default_asr_model(db: Session) -> str:
    """获取默认 ASR 模型。"""
    settings = ensure_default_subtitle_settings(db)
    return settings.default_asr_model or DEFAULT_SUBTITLE_SETTINGS["default_asr_model"]


__all__ = [
    "SubtitleSettingsSnapshot",
    "ensure_default_subtitle_settings",
    "get_subtitle_settings",
    "get_subtitle_settings_snapshot",
    "get_default_asr_model",
]
