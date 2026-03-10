from __future__ import annotations

import hashlib
import json
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil
from typing import Iterable

from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.core.config import REDEEM_CODE_DEFAULT_DAILY_LIMIT, REDEEM_CODE_DEFAULT_VALID_DAYS
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.repositories.billing_rates import list_billing_rates as query_billing_rates
from app.models import (
    AdminOperationLog,
    BillingModelRate,
    RedeemCode,
    RedeemCodeAttempt,
    RedeemCodeBatch,
    SubtitleSetting,
    TranslationRequestLog,
    WalletAccount,
    WalletLedger,
)


EVENT_RESERVE = "reserve"
EVENT_CONSUME = "consume"
EVENT_REFUND = "refund"
EVENT_CONSUME_TRANSLATE = "consume_translate"
EVENT_REFUND_TRANSLATE = "refund_translate"
EVENT_MANUAL_ADJUST = "manual_adjust"
EVENT_REDEEM_CODE = "redeem_code"

REDEEM_BATCH_STATUS_ACTIVE = "active"
REDEEM_BATCH_STATUS_PAUSED = "paused"
REDEEM_BATCH_STATUS_EXPIRED = "expired"

REDEEM_CODE_STATUS_ACTIVE = "active"
REDEEM_CODE_STATUS_DISABLED = "disabled"
REDEEM_CODE_STATUS_ABANDONED = "abandoned"
REDEEM_CODE_STATUS_REDEEMED = "redeemed"

REDEEM_FAIL_CODE_NOT_FOUND = "code_not_found"
REDEEM_FAIL_ALREADY_USED = "already_used"
REDEEM_FAIL_EXPIRED = "expired"
REDEEM_FAIL_DISABLED = "disabled"
REDEEM_FAIL_DAILY_LIMIT = "daily_limit_exceeded"
REDEEM_FAIL_NOT_ACTIVE = "not_active"

_REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
logger = logging.getLogger(__name__)


DEFAULT_MT_POINTS_PER_1K_TOKENS = 15
MT_FLASH_MODEL = "qwen-mt-flash"
MT_MODEL_PREFIX = "qwen-mt-"

DEFAULT_MODEL_RATES: tuple[dict[str, object], ...] = (
    {
        "model_name": "qwen3-asr-flash-filetrans",
        "points_per_minute": 130,
        "points_per_1k_tokens": 0,
        "billing_unit": "minute",
        "parallel_enabled": True,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 4,
    },
    {
        "model_name": MT_FLASH_MODEL,
        "points_per_minute": 0,
        "points_per_1k_tokens": DEFAULT_MT_POINTS_PER_1K_TOKENS,
        "billing_unit": "1k_tokens",
        "parallel_enabled": False,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 1,
    },
)

DEFAULT_SUBTITLE_SETTINGS = {
    "semantic_split_default_enabled": False,
    "subtitle_split_enabled": True,
    "subtitle_split_target_words": 18,
    "subtitle_split_max_words": 28,
    "semantic_split_max_words_threshold": 24,
    "semantic_split_timeout_seconds": 40,
    "translation_batch_max_chars": 2600,
}

_SUBTITLE_SETTINGS_REQUIRED_COLUMN_SQL: tuple[tuple[str, str, str], ...] = (
    ("semantic_split_default_enabled", "BOOLEAN NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("subtitle_split_enabled", "BOOLEAN NOT NULL DEFAULT 1", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("subtitle_split_target_words", "INTEGER NOT NULL DEFAULT 18", "INTEGER NOT NULL DEFAULT 18"),
    ("subtitle_split_max_words", "INTEGER NOT NULL DEFAULT 28", "INTEGER NOT NULL DEFAULT 28"),
    ("semantic_split_max_words_threshold", "INTEGER NOT NULL DEFAULT 24", "INTEGER NOT NULL DEFAULT 24"),
    ("semantic_split_timeout_seconds", "INTEGER NOT NULL DEFAULT 40", "INTEGER NOT NULL DEFAULT 40"),
    ("translation_batch_max_chars", "INTEGER NOT NULL DEFAULT 2600", "INTEGER NOT NULL DEFAULT 2600"),
    ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("updated_by_user_id", "INTEGER", "INTEGER"),
)


@dataclass
class BillingError(Exception):
    code: str
    message: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover
        return self.message


@dataclass(frozen=True)
class SubtitleSettingsSnapshot:
    semantic_split_default_enabled: bool
    subtitle_split_enabled: bool
    subtitle_split_target_words: int
    subtitle_split_max_words: int
    semantic_split_max_words_threshold: int
    semantic_split_timeout_seconds: int
    translation_batch_max_chars: int


def _now() -> datetime:
    return now_shanghai_naive()


def _ensure_legacy_sqlite_billing_columns(db: Session) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return

    inspector = inspect(bind)
    table_name = BillingModelRate.__tablename__
    if not inspector.has_table(table_name):
        return

    existing_columns = {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name)}
    alter_sql: list[str] = []
    if "points_per_1k_tokens" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN points_per_1k_tokens INTEGER NOT NULL DEFAULT 0")
    if "billing_unit" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN billing_unit VARCHAR(32) NOT NULL DEFAULT 'minute'")
    if "parallel_enabled" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN parallel_enabled BOOLEAN NOT NULL DEFAULT 0")
    if "parallel_threshold_seconds" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN parallel_threshold_seconds INTEGER NOT NULL DEFAULT 600")
    if "segment_seconds" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN segment_seconds INTEGER NOT NULL DEFAULT 300")
    if "max_concurrency" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN max_concurrency INTEGER NOT NULL DEFAULT 2")

    if alter_sql:
        for sql in alter_sql:
            db.execute(text(sql))
        db.commit()
    if _sqlite_billing_rates_requires_rebuild(db):
        _rebuild_legacy_sqlite_billing_rates(db)
    TranslationRequestLog.__table__.create(bind=bind, checkfirst=True)


def _ensure_legacy_sqlite_wallet_ledger_event_types(db: Session) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return

    inspector = inspect(bind)
    table_name = WalletLedger.__tablename__
    if not inspector.has_table(table_name):
        return

    existing_columns = {str(item.get("name") or "").strip() for item in inspector.get_columns(table_name)}
    alter_sql: list[str] = []
    if "redeem_batch_id" not in existing_columns:
        alter_sql.append("ALTER TABLE wallet_ledger ADD COLUMN redeem_batch_id INTEGER")
    if "redeem_code_id" not in existing_columns:
        alter_sql.append("ALTER TABLE wallet_ledger ADD COLUMN redeem_code_id INTEGER")
    if "redeem_code_mask" not in existing_columns:
        alter_sql.append("ALTER TABLE wallet_ledger ADD COLUMN redeem_code_mask VARCHAR(32)")

    if alter_sql:
        for sql in alter_sql:
            db.execute(text(sql))
        db.commit()

    ddl = str(
        db.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:table_name"),
            {"table_name": table_name},
        ).scalar()
        or ""
    ).lower()
    if "consume_translate" in ddl and "refund_translate" in ddl and "redeem_code" in ddl:
        _cleanup_stale_sqlite_legacy_table(db, f"{table_name}__legacy")
        return
    _rebuild_legacy_sqlite_wallet_ledger(db)


def _sqlite_billing_rates_requires_rebuild(db: Session) -> bool:
    ddl = str(
        db.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:table_name"),
            {"table_name": BillingModelRate.__tablename__},
        ).scalar()
        or ""
    ).lower()
    if not ddl:
        return False
    return (
        "points_per_minute > 0" in ddl
        or "ck_billing_rate_token_non_negative" not in ddl
        or "ck_billing_parallel_threshold_positive" not in ddl
        or "ck_billing_segment_seconds_positive" not in ddl
        or "ck_billing_max_concurrency_positive" not in ddl
    )


def _rebuild_legacy_sqlite_billing_rates(db: Session) -> None:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("billing_model_rates sqlite rebuild missing bind")

    table_name = BillingModelRate.__tablename__
    legacy_table_name = f"{table_name}__legacy"
    logger.warning("[DEBUG] billing_rates.sqlite_rebuild_start table=%s", table_name)

    try:
        db.rollback()
        db.execute(text("PRAGMA foreign_keys=OFF"))
        db.commit()
        db.execute(text(f"ALTER TABLE {table_name} RENAME TO {legacy_table_name}"))
        db.commit()
        BillingModelRate.__table__.create(bind=bind, checkfirst=True)
        db.execute(
            text(
                f"""
                INSERT INTO {table_name} (
                    model_name,
                    points_per_minute,
                    points_per_1k_tokens,
                    billing_unit,
                    is_active,
                    parallel_enabled,
                    parallel_threshold_seconds,
                    segment_seconds,
                    max_concurrency,
                    updated_at,
                    updated_by_user_id
                )
                SELECT
                    model_name,
                    CASE
                        WHEN COALESCE(points_per_minute, 0) < 0 THEN 0
                        ELSE COALESCE(points_per_minute, 0)
                    END AS points_per_minute,
                    CASE
                        WHEN COALESCE(points_per_1k_tokens, 0) < 0 THEN 0
                        ELSE COALESCE(points_per_1k_tokens, 0)
                    END AS points_per_1k_tokens,
                    CASE
                        WHEN TRIM(COALESCE(billing_unit, '')) <> '' THEN TRIM(billing_unit)
                        WHEN COALESCE(points_per_1k_tokens, 0) > 0 THEN '1k_tokens'
                        ELSE 'minute'
                    END AS billing_unit,
                    COALESCE(is_active, 1) AS is_active,
                    COALESCE(parallel_enabled, 0) AS parallel_enabled,
                    CASE
                        WHEN COALESCE(parallel_threshold_seconds, 0) > 0 THEN parallel_threshold_seconds
                        ELSE 600
                    END AS parallel_threshold_seconds,
                    CASE
                        WHEN COALESCE(segment_seconds, 0) > 0 THEN segment_seconds
                        ELSE 300
                    END AS segment_seconds,
                    CASE
                        WHEN COALESCE(max_concurrency, 0) > 0 THEN max_concurrency
                        ELSE 2
                    END AS max_concurrency,
                    COALESCE(updated_at, CURRENT_TIMESTAMP) AS updated_at,
                    updated_by_user_id
                FROM {legacy_table_name}
                """
            )
        )
        db.execute(text(f"DROP TABLE {legacy_table_name}"))
        db.commit()
        logger.info("[DEBUG] billing_rates.sqlite_rebuild_success table=%s", table_name)
    except Exception as exc:
        db.rollback()
        logger.exception("[DEBUG] billing_rates.sqlite_rebuild_failed detail=%s", str(exc)[:400])
        raise
    finally:
        db.execute(text("PRAGMA foreign_keys=ON"))
        db.commit()


def _rebuild_legacy_sqlite_wallet_ledger(db: Session) -> None:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("wallet_ledger sqlite rebuild missing bind")

    table_name = WalletLedger.__tablename__
    legacy_table_name = f"{table_name}__legacy"
    logger.warning("[DEBUG] wallet_ledger.sqlite_rebuild_start table=%s", table_name)

    try:
        db.rollback()
        db.execute(text("PRAGMA foreign_keys=OFF"))
        db.commit()
        db.execute(text(f"ALTER TABLE {table_name} RENAME TO {legacy_table_name}"))
        db.commit()
        _drop_sqlite_indexes_for_table(db, legacy_table_name)
        db.commit()
        WalletLedger.__table__.create(bind=bind, checkfirst=True)
        db.execute(
            text(
                f"""
                INSERT INTO {table_name} (
                    id,
                    user_id,
                    operator_user_id,
                    event_type,
                    delta_points,
                    balance_after,
                    model_name,
                    duration_ms,
                    lesson_id,
                    redeem_batch_id,
                    redeem_code_id,
                    redeem_code_mask,
                    note,
                    created_at
                )
                SELECT
                    id,
                    user_id,
                    operator_user_id,
                    event_type,
                    delta_points,
                    balance_after,
                    model_name,
                    duration_ms,
                    lesson_id,
                    redeem_batch_id,
                    redeem_code_id,
                    redeem_code_mask,
                    COALESCE(note, '') AS note,
                    COALESCE(created_at, CURRENT_TIMESTAMP) AS created_at
                FROM {legacy_table_name}
                """
            )
        )
        db.execute(text(f"DROP TABLE {legacy_table_name}"))
        db.commit()
        logger.info("[DEBUG] wallet_ledger.sqlite_rebuild_success table=%s", table_name)
    except Exception as exc:
        db.rollback()
        logger.exception("[DEBUG] wallet_ledger.sqlite_rebuild_failed detail=%s", str(exc)[:400])
        raise
    finally:
        db.execute(text("PRAGMA foreign_keys=ON"))
        db.commit()


def _drop_sqlite_indexes_for_table(db: Session, table_name: str) -> None:
    rows = db.execute(
        text(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'index'
              AND tbl_name = :table_name
              AND sql IS NOT NULL
            """
        ),
        {"table_name": table_name},
    ).fetchall()
    for row in rows:
        index_name = str(row[0] or "").strip()
        if not index_name:
            continue
        db.execute(text(f'DROP INDEX IF EXISTS "{index_name}"'))


def _cleanup_stale_sqlite_legacy_table(db: Session, table_name: str) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return
    inspector = inspect(bind)
    if not inspector.has_table(table_name):
        return

    logger.warning("[DEBUG] sqlite_legacy_cleanup_start table=%s", table_name)
    try:
        db.rollback()
        db.execute(text("PRAGMA foreign_keys=OFF"))
        db.commit()
        db.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
        db.commit()
        logger.info("[DEBUG] sqlite_legacy_cleanup_success table=%s", table_name)
    except Exception as exc:
        db.rollback()
        logger.exception("[DEBUG] sqlite_legacy_cleanup_failed detail=%s", str(exc)[:400])
        raise
    finally:
        db.execute(text("PRAGMA foreign_keys=ON"))
        db.commit()


def normalize_redeem_code_input(code: str) -> str:
    normalized = (code or "").strip().upper().replace(" ", "")
    return normalized.replace("-", "")


def hash_redeem_code(normalized_code: str) -> str:
    return hashlib.sha256(normalized_code.encode("utf-8")).hexdigest()


def mask_redeem_code(normalized_code: str) -> str:
    if not normalized_code:
        return "****"
    if len(normalized_code) <= 8:
        return f"{normalized_code[:2]}****{normalized_code[-2:]}"
    return f"{normalized_code[:4]}****{normalized_code[-4:]}"


def _generate_redeem_code_plain() -> str:
    raw = "".join(secrets.choice(_REDEEM_ALPHABET) for _ in range(16))
    return "-".join((raw[0:4], raw[4:8], raw[8:12], raw[12:16]))


def append_admin_operation_log(
    db: Session,
    *,
    operator_user_id: int | None,
    action_type: str,
    target_type: str,
    target_id: str,
    before_value: dict | None,
    after_value: dict | None,
    note: str = "",
) -> AdminOperationLog:
    row = AdminOperationLog(
        operator_user_id=operator_user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=str(target_id or ""),
        before_value=json.dumps(before_value or {}, ensure_ascii=False, sort_keys=True),
        after_value=json.dumps(after_value or {}, ensure_ascii=False, sort_keys=True),
        note=(note or "").strip(),
    )
    db.add(row)
    db.flush()
    return row


def _flash_mt_default_payload() -> dict[str, object]:
    for item in DEFAULT_MODEL_RATES:
        if str(item.get("model_name") or "").strip() == MT_FLASH_MODEL:
            return dict(item)
    return {
        "model_name": MT_FLASH_MODEL,
        "points_per_minute": 0,
        "points_per_1k_tokens": DEFAULT_MT_POINTS_PER_1K_TOKENS,
        "billing_unit": "1k_tokens",
        "parallel_enabled": False,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 1,
    }


def _billing_model_rates_columns(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    schema = None if bind.dialect.name == "sqlite" else BillingModelRate.__table__.schema
    inspector = inspect(bind)
    if not inspector.has_table(BillingModelRate.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(BillingModelRate.__tablename__, schema=schema)}


def _cleanup_non_flash_mt_rates(db: Session, *, ensure_flash: bool) -> tuple[int, bool]:
    required_columns = {
        "model_name",
        "points_per_minute",
        "points_per_1k_tokens",
        "billing_unit",
        "is_active",
        "parallel_enabled",
        "parallel_threshold_seconds",
        "segment_seconds",
        "max_concurrency",
    }
    column_names = _billing_model_rates_columns(db)
    if not column_names:
        return 0, False
    missing_columns = sorted(required_columns - column_names)
    if missing_columns:
        logger.warning(
            "[DEBUG] billing_rates.mt_flash_only_skip_partial_schema missing=%s",
            ",".join(missing_columns),
        )
        return 0, False

    legacy_rows = list(
        db.scalars(
            select(BillingModelRate).where(
                BillingModelRate.model_name.like(f"{MT_MODEL_PREFIX}%"),
                BillingModelRate.model_name != MT_FLASH_MODEL,
            )
        ).all()
    )
    removed_count = len(legacy_rows)
    for row in legacy_rows:
        db.delete(row)

    seeded_flash = False
    flash_row = db.get(BillingModelRate, MT_FLASH_MODEL) if ensure_flash else object()
    if flash_row is None:
        seed = _flash_mt_default_payload()
        db.add(
            BillingModelRate(
                model_name=MT_FLASH_MODEL,
                points_per_minute=int(seed.get("points_per_minute") or 0),
                points_per_1k_tokens=int(seed.get("points_per_1k_tokens") or 0),
                billing_unit=str(seed.get("billing_unit") or "1k_tokens"),
                is_active=True,
                parallel_enabled=bool(seed.get("parallel_enabled")),
                parallel_threshold_seconds=int(seed.get("parallel_threshold_seconds") or 600),
                segment_seconds=int(seed.get("segment_seconds") or 300),
                max_concurrency=int(seed.get("max_concurrency") or 1),
            )
        )
        seeded_flash = True

    if removed_count > 0 or seeded_flash:
        logger.warning(
            "[DEBUG] billing_rates.mt_flash_only_cleanup removed=%s seeded_flash=%s",
            removed_count,
            seeded_flash,
        )
    return removed_count, seeded_flash


def enforce_mt_flash_only_rates(db: Session) -> bool:
    removed_count, seeded_flash = _cleanup_non_flash_mt_rates(db, ensure_flash=True)
    changed = removed_count > 0 or seeded_flash
    if changed:
        db.commit()
        logger.warning(
            "[DEBUG] billing_rates.mt_flash_only_self_heal removed=%s seeded_flash=%s",
            removed_count,
            seeded_flash,
        )
    return changed


def ensure_default_billing_rates(
    db: Session,
    defaults: Iterable[dict[str, object]] = DEFAULT_MODEL_RATES,
) -> None:
    _ensure_legacy_sqlite_billing_columns(db)
    _ensure_legacy_sqlite_wallet_ledger_event_types(db)
    ensure_default_subtitle_settings(db)

    changed = False
    legacy_para = db.get(BillingModelRate, "paraformer-v2")
    if legacy_para is not None:
        db.delete(legacy_para)
        changed = True
    removed_count, seeded_flash = _cleanup_non_flash_mt_rates(db, ensure_flash=False)
    if removed_count > 0 or seeded_flash:
        changed = True

    for item in defaults:
        model_name = str(item.get("model_name") or "").strip()
        points_per_minute = int(item.get("points_per_minute") or 0)
        points_per_1k_tokens = int(item.get("points_per_1k_tokens") or 0)
        billing_unit = str(item.get("billing_unit") or "minute").strip() or "minute"
        parallel_enabled = bool(item.get("parallel_enabled"))
        parallel_threshold_seconds = int(item.get("parallel_threshold_seconds") or 600)
        segment_seconds = int(item.get("segment_seconds") or 300)
        max_concurrency = int(item.get("max_concurrency") or 2)
        exists = db.get(BillingModelRate, model_name)
        if exists:
            row_changed = False
            if int(getattr(exists, "points_per_1k_tokens", 0) or 0) < 0:
                exists.points_per_1k_tokens = points_per_1k_tokens
                row_changed = True
            if not str(getattr(exists, "billing_unit", "") or "").strip():
                exists.billing_unit = billing_unit
                row_changed = True
            if exists.parallel_enabled is None:
                exists.parallel_enabled = bool(parallel_enabled)
                row_changed = True
            if int(exists.parallel_threshold_seconds or 0) <= 0:
                exists.parallel_threshold_seconds = int(parallel_threshold_seconds)
                row_changed = True
            if int(exists.segment_seconds or 0) <= 0:
                exists.segment_seconds = int(segment_seconds)
                row_changed = True
            if int(exists.max_concurrency or 0) <= 0:
                exists.max_concurrency = int(max_concurrency)
                row_changed = True
            if row_changed:
                db.add(exists)
                changed = True
            continue
        db.add(
            BillingModelRate(
                model_name=model_name,
                points_per_minute=points_per_minute,
                points_per_1k_tokens=points_per_1k_tokens,
                billing_unit=billing_unit,
                is_active=True,
                parallel_enabled=parallel_enabled,
                parallel_threshold_seconds=parallel_threshold_seconds,
                segment_seconds=segment_seconds,
                max_concurrency=max_concurrency,
            )
        )
        changed = True
    if changed:
        db.commit()


def ensure_default_subtitle_settings(db: Session) -> SubtitleSetting:
    _ensure_subtitle_settings_schema(db)
    try:
        row = db.get(SubtitleSetting, 1)
    except Exception as exc:
        if _is_missing_subtitle_settings_error(exc):
            _ensure_subtitle_settings_schema(db)
            db.expire_all()
            row = db.get(SubtitleSetting, 1)
        else:
            logger.exception("[DEBUG] subtitle_settings.ensure_failed detail=%s", str(exc)[:400])
            raise
    if row is None:
        row = SubtitleSetting(id=1, **DEFAULT_SUBTITLE_SETTINGS)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    changed = _normalize_subtitle_settings_row(row)
    if changed:
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_subtitle_settings(db: Session) -> SubtitleSetting:
    _ensure_subtitle_settings_schema(db)
    try:
        row = db.get(SubtitleSetting, 1)
    except Exception as exc:
        if _is_missing_subtitle_settings_error(exc):
            _ensure_subtitle_settings_schema(db)
            db.expire_all()
            row = db.get(SubtitleSetting, 1)
        else:
            logger.exception("[DEBUG] subtitle_settings.load_failed detail=%s", str(exc)[:400])
            raise
    if row is None:
        row = ensure_default_subtitle_settings(db)
    elif _normalize_subtitle_settings_row(row):
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_subtitle_settings_snapshot(db: Session) -> SubtitleSettingsSnapshot:
    row = get_subtitle_settings(db)
    return SubtitleSettingsSnapshot(
        semantic_split_default_enabled=bool(row.semantic_split_default_enabled),
        subtitle_split_enabled=bool(row.subtitle_split_enabled),
        subtitle_split_target_words=int(row.subtitle_split_target_words),
        subtitle_split_max_words=int(row.subtitle_split_max_words),
        semantic_split_max_words_threshold=int(row.semantic_split_max_words_threshold),
        semantic_split_timeout_seconds=int(row.semantic_split_timeout_seconds),
        translation_batch_max_chars=max(1, min(12000, int(getattr(row, "translation_batch_max_chars", 2600) or 2600))),
    )


def _is_missing_subtitle_settings_error(exc: Exception) -> bool:
    candidates = [str(exc)]
    original = getattr(exc, "orig", None)
    if original is not None:
        candidates.append(str(original))
        candidates.append(original.__class__.__name__)
    normalized = " | ".join(item.lower() for item in candidates if item)
    return (
        "subtitle_settings" in normalized
        and (
            "does not exist" in normalized
            or "no such table" in normalized
            or "undefinedtable" in normalized
            or "no such column" in normalized
            or "undefinedcolumn" in normalized
            or "has no column named" in normalized
        )
    )


def _self_heal_subtitle_settings(db: Session) -> SubtitleSetting:
    logger.warning("[DEBUG] subtitle_settings.self_heal_start")
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("subtitle_settings self-heal missing bind")

    try:
        db.rollback()
        if bind.dialect.name != "sqlite":
            db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
            db.commit()
        SubtitleSetting.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        _ensure_subtitle_settings_schema(db)
        row = db.get(SubtitleSetting, 1)
        if row is None:
            row = SubtitleSetting(id=1, **DEFAULT_SUBTITLE_SETTINGS)
            db.add(row)
            db.commit()
            db.refresh(row)
        elif _normalize_subtitle_settings_row(row):
            db.add(row)
            db.commit()
            db.refresh(row)
        logger.info("[DEBUG] subtitle_settings.self_heal_success")
        return row
    except ProgrammingError as exc:
        db.rollback()
        logger.exception("[DEBUG] subtitle_settings.self_heal_failed detail=%s", str(exc)[:400])
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("[DEBUG] subtitle_settings.self_heal_failed detail=%s", str(exc)[:400])
        raise


def _subtitle_settings_schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return SubtitleSetting.__table__.schema


def _qualified_subtitle_settings_table(db: Session) -> str:
    schema = _subtitle_settings_schema_name(db)
    return f"{schema}.{SubtitleSetting.__tablename__}" if schema else SubtitleSetting.__tablename__


def _subtitle_settings_column_names(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    inspector = inspect(bind)
    schema = _subtitle_settings_schema_name(db)
    if not inspector.has_table(SubtitleSetting.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(SubtitleSetting.__tablename__, schema=schema)}


def _ensure_subtitle_settings_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("subtitle_settings schema repair missing bind")

    schema = _subtitle_settings_schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(SubtitleSetting.__tablename__, schema=schema):
        logger.warning("[DEBUG] subtitle_settings.schema_repair_create_table")
        SubtitleSetting.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    existing_columns = _subtitle_settings_column_names(db)
    table_name = _qualified_subtitle_settings_table(db)
    dialect_name = bind.dialect.name
    missing_columns = [item for item in _SUBTITLE_SETTINGS_REQUIRED_COLUMN_SQL if item[0] not in existing_columns]

    for column_name, sqlite_sql, default_sql in missing_columns:
        column_sql = sqlite_sql if dialect_name == "sqlite" else default_sql
        db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
        changed = True

    if missing_columns:
        db.commit()
        logger.warning(
            "[DEBUG] subtitle_settings.schema_repair_add_columns missing=%s",
            ",".join(column_name for column_name, _, _ in missing_columns),
        )

    if _backfill_subtitle_settings_values(db):
        changed = True
    return changed


def _backfill_subtitle_settings_values(db: Session) -> bool:
    table_name = _qualified_subtitle_settings_table(db)
    column_names = _subtitle_settings_column_names(db)
    if not column_names:
        return False

    changed = False
    for column_name, default_value in DEFAULT_SUBTITLE_SETTINGS.items():
        if column_name not in column_names:
            continue
        if isinstance(default_value, bool):
            default_sql = "1" if default_value else "0"
            update_sql = f"UPDATE {table_name} SET {column_name} = {default_sql} WHERE {column_name} IS NULL"
        elif column_name == "translation_batch_max_chars":
            update_sql = (
                f"UPDATE {table_name} SET {column_name} = {int(default_value)} "
                f"WHERE {column_name} IS NULL OR {column_name} <= 0 OR {column_name} > 12000"
            )
        else:
            update_sql = (
                f"UPDATE {table_name} SET {column_name} = {int(default_value)} "
                f"WHERE {column_name} IS NULL OR {column_name} <= 0"
            )
        result = db.execute(text(update_sql))
        changed = changed or bool(getattr(result, "rowcount", 0))

    if "updated_at" in column_names:
        result = db.execute(text(f"UPDATE {table_name} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
        changed = changed or bool(getattr(result, "rowcount", 0))

    if changed:
        db.commit()
        logger.warning("[DEBUG] subtitle_settings.schema_repair_backfill applied=true")
    return changed


def _normalize_subtitle_settings_row(row: SubtitleSetting) -> bool:
    changed = False
    for key, value in DEFAULT_SUBTITLE_SETTINGS.items():
        current = getattr(row, key)
        if isinstance(value, bool):
            if current is None:
                setattr(row, key, value)
                changed = True
            continue
        if current in (None, ""):
            setattr(row, key, value)
            changed = True
            continue
        current_int = int(current)
        if key == "translation_batch_max_chars":
            normalized_int = max(1, min(12000, current_int))
            if normalized_int != current_int:
                setattr(row, key, normalized_int)
                changed = True
        elif current_int <= 0:
            setattr(row, key, value)
            changed = True
    if getattr(row, "updated_at", None) is None:
        row.updated_at = _now()
        changed = True
    return changed


def get_or_create_wallet_account(db: Session, user_id: int, *, for_update: bool = False) -> WalletAccount:
    stmt = select(WalletAccount).where(WalletAccount.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    account = db.scalar(stmt)
    if account:
        return account
    account = WalletAccount(user_id=user_id, balance_points=0)
    db.add(account)
    db.flush()
    return account


def get_model_rate(db: Session, model_name: str, *, require_active: bool = True) -> BillingModelRate:
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        raise BillingError("BILLING_RATE_NOT_FOUND", "未找到模型计费配置", model_name)
    if require_active and not rate.is_active:
        raise BillingError("BILLING_RATE_DISABLED", "模型计费已停用", model_name)
    return rate


def list_public_rates(db: Session) -> list[BillingModelRate]:
    return list(query_billing_rates(db, active_only=True))


def calculate_points(duration_ms: int, points_per_minute: int) -> int:
    if duration_ms <= 0 or points_per_minute <= 0:
        return 0
    seconds = ceil(duration_ms / 1000)
    return ceil((seconds * points_per_minute) / 60)


def calculate_token_points(total_tokens: int, points_per_1k_tokens: int) -> int:
    if total_tokens <= 0 or points_per_1k_tokens <= 0:
        return 0
    return ceil((int(total_tokens) * int(points_per_1k_tokens)) / 1000)


def _append_ledger(
    db: Session,
    *,
    user_id: int,
    operator_user_id: int | None,
    event_type: str,
    delta_points: int,
    balance_after: int,
    model_name: str | None = None,
    duration_ms: int | None = None,
    lesson_id: int | None = None,
    redeem_batch_id: int | None = None,
    redeem_code_id: int | None = None,
    redeem_code_mask: str | None = None,
    note: str = "",
) -> WalletLedger:
    item = WalletLedger(
        user_id=user_id,
        operator_user_id=operator_user_id,
        event_type=event_type,
        delta_points=delta_points,
        balance_after=balance_after,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        redeem_batch_id=redeem_batch_id,
        redeem_code_id=redeem_code_id,
        redeem_code_mask=redeem_code_mask,
        note=note.strip(),
    )
    db.add(item)
    db.flush()
    return item


def reserve_points(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str,
    duration_ms: int,
    note: str = "",
) -> WalletLedger:
    if points < 0:
        raise BillingError("INVALID_POINTS", "预扣点数不能为负数", str(points))
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    if account.balance_points < points:
        raise BillingError(
            "INSUFFICIENT_BALANCE",
            "余额不足，无法创建课程",
            f"balance={account.balance_points}, required={points}",
        )
    account.balance_points -= points
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_RESERVE,
        delta_points=-points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note,
    )


def record_consume(
    db: Session,
    *,
    user_id: int,
    model_name: str,
    duration_ms: int,
    lesson_id: int,
    note: str = "",
) -> WalletLedger:
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_CONSUME,
        delta_points=0,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )


def consume_points(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str | None,
    lesson_id: int | None,
    event_type: str = EVENT_CONSUME,
    duration_ms: int | None = None,
    note: str = "",
) -> WalletLedger | None:
    if points < 0:
        raise BillingError("INVALID_POINTS", "扣点不能为负数", str(points))
    if points == 0:
        return None
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points -= points
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=event_type,
        delta_points=-points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )


def refund_points(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str | None,
    duration_ms: int | None,
    note: str = "",
) -> WalletLedger:
    if points < 0:
        raise BillingError("INVALID_POINTS", "退款点数不能为负数", str(points))
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points += points
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_REFUND,
        delta_points=points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note,
    )


def refund_points_by_event(
    db: Session,
    *,
    user_id: int,
    points: int,
    model_name: str | None,
    lesson_id: int | None,
    event_type: str = EVENT_REFUND,
    duration_ms: int | None = None,
    note: str = "",
) -> WalletLedger | None:
    if points < 0:
        raise BillingError("INVALID_POINTS", "退款点数不能为负数", str(points))
    if points == 0:
        return None
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points += points
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=event_type,
        delta_points=points,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        lesson_id=lesson_id,
        note=note,
    )


def settle_reserved_points(
    db: Session,
    *,
    user_id: int,
    model_name: str,
    reserved_points: int,
    actual_points: int,
    duration_ms: int | None,
    note: str = "",
) -> WalletLedger | None:
    if reserved_points < 0:
        raise BillingError("INVALID_POINTS", "预扣点数不能为负数", str(reserved_points))
    if actual_points < 0:
        raise BillingError("INVALID_POINTS", "实耗点数不能为负数", str(actual_points))

    diff = int(actual_points) - int(reserved_points)
    if diff == 0:
        return None

    if diff < 0:
        return refund_points(
            db,
            user_id=user_id,
            points=abs(diff),
            model_name=model_name,
            duration_ms=duration_ms,
            note=note or "结算退款",
        )

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points -= diff
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_CONSUME,
        delta_points=-diff,
        balance_after=account.balance_points,
        model_name=model_name,
        duration_ms=duration_ms,
        note=note or "结算补扣",
    )


def append_translation_request_logs(
    db: Session,
    *,
    trace_id: str,
    user_id: int | None,
    task_id: str | None,
    lesson_id: int | None,
    records: Iterable[dict[str, object]],
) -> int:
    inserted = 0
    for item in records:
        row = TranslationRequestLog(
            trace_id=str(trace_id or "").strip(),
            task_id=str(item.get("task_id") or task_id or "").strip() or None,
            lesson_id=int(item["lesson_id"]) if item.get("lesson_id") is not None else lesson_id,
            user_id=int(item["user_id"]) if item.get("user_id") is not None else user_id,
            sentence_idx=int(item.get("sentence_idx", 0)),
            attempt_no=max(1, int(item.get("attempt_no", 1))),
            provider=str(item.get("provider") or "dashscope_compatible"),
            model_name=str(item.get("model_name") or ""),
            base_url=str(item.get("base_url") or ""),
            input_text_preview=str(item.get("input_text_preview") or ""),
            provider_request_id=str(item.get("provider_request_id") or "").strip() or None,
            status_code=int(item["status_code"]) if item.get("status_code") is not None else None,
            finish_reason=str(item.get("finish_reason") or "").strip() or None,
            prompt_tokens=max(0, int(item.get("prompt_tokens", 0) or 0)),
            completion_tokens=max(0, int(item.get("completion_tokens", 0) or 0)),
            total_tokens=max(0, int(item.get("total_tokens", 0) or 0)),
            success=bool(item.get("success")),
            error_code=str(item.get("error_code") or "").strip() or None,
            error_message=str(item.get("error_message") or ""),
            started_at=item.get("started_at") or _now(),
            finished_at=item.get("finished_at") or _now(),
            created_at=item.get("created_at") or item.get("finished_at") or _now(),
        )
        db.add(row)
        inserted += 1
    if inserted:
        db.flush()
    return inserted


def manual_adjust(
    db: Session,
    *,
    user_id: int,
    operator_user_id: int,
    delta_points: int,
    note: str,
) -> WalletLedger:
    if not note.strip():
        raise BillingError("INVALID_REASON", "调账备注不能为空")
    account = get_or_create_wallet_account(db, user_id, for_update=True)
    after_balance = account.balance_points + delta_points
    if after_balance < 0:
        raise BillingError(
            "INSUFFICIENT_BALANCE",
            "余额不足，不能扣减到负数",
            f"balance={account.balance_points}, delta={delta_points}",
        )
    account.balance_points = after_balance
    db.add(account)
    db.flush()
    return _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=operator_user_id,
        event_type=EVENT_MANUAL_ADJUST,
        delta_points=delta_points,
        balance_after=account.balance_points,
        note=note,
    )


def _generate_unique_redeem_codes(db: Session, quantity: int) -> list[tuple[str, str, str]]:
    generated: list[tuple[str, str, str]] = []
    in_batch_hashes: set[str] = set()

    while len(generated) < quantity:
        plain_code = _generate_redeem_code_plain()
        normalized = normalize_redeem_code_input(plain_code)
        code_hash = hash_redeem_code(normalized)
        if code_hash in in_batch_hashes:
            continue
        exists = db.scalar(select(RedeemCode.id).where(RedeemCode.code_hash == code_hash).limit(1))
        if exists:
            continue
        in_batch_hashes.add(code_hash)
        generated.append((plain_code, code_hash, mask_redeem_code(normalized)))

    return generated


def create_redeem_batch_and_codes(
    db: Session,
    *,
    batch_name: str,
    face_value_points: int,
    generate_quantity: int,
    active_from: datetime | None,
    expire_at: datetime | None,
    daily_limit_per_user: int | None,
    remark: str,
    created_by_user_id: int,
) -> tuple[RedeemCodeBatch, list[RedeemCode]]:
    if face_value_points <= 0:
        raise BillingError("INVALID_POINTS", "兑换面额必须大于 0")
    if generate_quantity <= 0:
        raise BillingError("INVALID_QUANTITY", "生成数量必须大于 0")
    if generate_quantity > 5000:
        raise BillingError("INVALID_QUANTITY", "单批最多生成 5000 个兑换码")
    if daily_limit_per_user is not None and daily_limit_per_user <= 0:
        raise BillingError("INVALID_DAILY_LIMIT", "单账号日限必须大于 0")

    now = _now()
    start_at = to_shanghai_naive(active_from) or now
    end_at = to_shanghai_naive(expire_at) or (start_at + timedelta(days=max(1, REDEEM_CODE_DEFAULT_VALID_DAYS)))
    if end_at <= start_at:
        raise BillingError("INVALID_TIME_RANGE", "失效时间必须晚于生效时间")

    batch = RedeemCodeBatch(
        batch_name=batch_name.strip() or f"batch_{now.strftime('%Y%m%d_%H%M%S')}",
        face_value_points=face_value_points,
        generated_count=generate_quantity,
        active_from=start_at,
        expire_at=end_at,
        daily_limit_per_user=daily_limit_per_user,
        status=REDEEM_BATCH_STATUS_ACTIVE,
        remark=(remark or "").strip(),
        created_by_user_id=created_by_user_id,
    )
    db.add(batch)
    db.flush()

    code_rows: list[RedeemCode] = []
    generated_codes = _generate_unique_redeem_codes(db, generate_quantity)
    for plain_code, code_hash, mask in generated_codes:
        row = RedeemCode(
            batch_id=batch.id,
            code_plain=plain_code,
            code_hash=code_hash,
            masked_code=mask,
            status=REDEEM_CODE_STATUS_ACTIVE,
            created_by_user_id=created_by_user_id,
        )
        code_rows.append(row)
    db.add_all(code_rows)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=created_by_user_id,
        action_type="redeem_batch_create",
        target_type="redeem_batch",
        target_id=str(batch.id),
        before_value={},
        after_value={
            "batch_name": batch.batch_name,
            "face_value_points": batch.face_value_points,
            "generated_count": batch.generated_count,
            "active_from": to_shanghai_aware(batch.active_from).isoformat(),
            "expire_at": to_shanghai_aware(batch.expire_at).isoformat(),
            "daily_limit_per_user": batch.daily_limit_per_user,
            "status": batch.status,
        },
        note="batch_created",
    )
    return batch, code_rows


def copy_redeem_batch_and_codes(
    db: Session,
    *,
    source_batch_id: int,
    generate_quantity: int,
    created_by_user_id: int,
) -> tuple[RedeemCodeBatch, list[RedeemCode]]:
    source = db.get(RedeemCodeBatch, source_batch_id)
    if not source:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "兑换码批次不存在", str(source_batch_id))

    return create_redeem_batch_and_codes(
        db,
        batch_name=f"{source.batch_name}_copy",
        face_value_points=source.face_value_points,
        generate_quantity=generate_quantity,
        active_from=source.active_from,
        expire_at=source.expire_at,
        daily_limit_per_user=source.daily_limit_per_user,
        remark=source.remark,
        created_by_user_id=created_by_user_id,
    )


def set_redeem_batch_status(
    db: Session,
    *,
    batch_id: int,
    next_status: str,
    operator_user_id: int,
    note: str = "",
) -> RedeemCodeBatch:
    batch = db.scalar(select(RedeemCodeBatch).where(RedeemCodeBatch.id == batch_id).with_for_update())
    if not batch:
        raise BillingError("REDEEM_BATCH_NOT_FOUND", "兑换码批次不存在", str(batch_id))

    if next_status not in {REDEEM_BATCH_STATUS_ACTIVE, REDEEM_BATCH_STATUS_PAUSED, REDEEM_BATCH_STATUS_EXPIRED}:
        raise BillingError("INVALID_STATUS", "无效的批次状态", next_status)

    before = {
        "status": batch.status,
        "active_from": to_shanghai_aware(batch.active_from).isoformat(),
        "expire_at": to_shanghai_aware(batch.expire_at).isoformat(),
    }

    batch.status = next_status
    if next_status == REDEEM_BATCH_STATUS_EXPIRED:
        now = _now()
        if batch.expire_at > now:
            batch.expire_at = now
    db.add(batch)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_batch_status_update",
        target_type="redeem_batch",
        target_id=str(batch.id),
        before_value=before,
        after_value={"status": batch.status, "expire_at": to_shanghai_aware(batch.expire_at).isoformat()},
        note=(note or "").strip(),
    )
    return batch


def update_redeem_code_status(
    db: Session,
    *,
    code_id: int,
    next_status: str,
    operator_user_id: int,
    note: str = "",
) -> RedeemCode:
    code = db.scalar(select(RedeemCode).where(RedeemCode.id == code_id).with_for_update())
    if not code:
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在", str(code_id))

    if code.status == REDEEM_CODE_STATUS_REDEEMED and next_status != REDEEM_CODE_STATUS_REDEEMED:
        raise BillingError("REDEEM_CODE_ALREADY_USED", "已兑换的兑换码不可变更状态")

    if next_status not in {
        REDEEM_CODE_STATUS_ACTIVE,
        REDEEM_CODE_STATUS_DISABLED,
        REDEEM_CODE_STATUS_ABANDONED,
        REDEEM_CODE_STATUS_REDEEMED,
    }:
        raise BillingError("INVALID_STATUS", "无效的兑换码状态", next_status)

    before = {"status": code.status}
    code.status = next_status
    db.add(code)
    db.flush()

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_code_status_update",
        target_type="redeem_code",
        target_id=str(code.id),
        before_value=before,
        after_value={"status": code.status},
        note=(note or "").strip(),
    )
    return code


def bulk_disable_redeem_codes(
    db: Session,
    *,
    operator_user_id: int,
    code_ids: list[int] | None = None,
    batch_id: int | None = None,
) -> int:
    stmt = select(RedeemCode).where(RedeemCode.status == REDEEM_CODE_STATUS_ACTIVE)
    if code_ids:
        stmt = stmt.where(RedeemCode.id.in_(code_ids))
    if batch_id is not None:
        stmt = stmt.where(RedeemCode.batch_id == batch_id)

    rows = list(db.scalars(stmt.with_for_update()).all())
    for row in rows:
        row.status = REDEEM_CODE_STATUS_DISABLED
        db.add(row)

    append_admin_operation_log(
        db,
        operator_user_id=operator_user_id,
        action_type="redeem_code_bulk_disable",
        target_type="redeem_code",
        target_id=str(batch_id or "batch:none"),
        before_value={"count": len(rows)},
        after_value={"status": REDEEM_CODE_STATUS_DISABLED},
        note=f"code_ids={len(code_ids or [])}",
    )
    db.flush()
    return len(rows)


def _append_redeem_attempt(
    db: Session,
    *,
    user_id: int,
    batch_id: int | None,
    code_id: int | None,
    code_mask: str,
    success: bool,
    failure_reason: str = "",
) -> RedeemCodeAttempt:
    row = RedeemCodeAttempt(
        user_id=user_id,
        batch_id=batch_id,
        code_id=code_id,
        code_mask=code_mask,
        success=success,
        failure_reason=(failure_reason or "").strip(),
    )
    db.add(row)
    db.flush()
    return row


def _check_daily_limit(db: Session, *, user_id: int, limit: int, now: datetime) -> bool:
    if limit <= 0:
        return True
    day_start = datetime(now.year, now.month, now.day)
    day_end = day_start + timedelta(days=1)
    used_count = int(
        db.scalar(
            select(func.count(RedeemCodeAttempt.id)).where(
                RedeemCodeAttempt.user_id == user_id,
                RedeemCodeAttempt.success.is_(True),
                RedeemCodeAttempt.created_at >= day_start,
                RedeemCodeAttempt.created_at < day_end,
            )
        )
        or 0
    )
    return used_count < limit


def redeem_code(
    db: Session,
    *,
    user_id: int,
    raw_code: str,
) -> WalletLedger:
    normalized = normalize_redeem_code_input(raw_code)
    if not normalized:
        raise BillingError("INVALID_REDEEM_CODE", "兑换码不能为空")

    code_hash = hash_redeem_code(normalized)
    code_mask = mask_redeem_code(normalized)
    now = _now()

    code = db.scalar(select(RedeemCode).where(RedeemCode.code_hash == code_hash).with_for_update())
    if not code:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=None,
            code_id=None,
            code_mask=code_mask,
            success=False,
            failure_reason=REDEEM_FAIL_CODE_NOT_FOUND,
        )
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在")

    batch = db.scalar(select(RedeemCodeBatch).where(RedeemCodeBatch.id == code.batch_id).with_for_update())
    if not batch:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=None,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_CODE_NOT_FOUND,
        )
        raise BillingError("REDEEM_CODE_NOT_FOUND", "兑换码不存在")

    if code.status == REDEEM_CODE_STATUS_REDEEMED or code.redeemed_at is not None:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_ALREADY_USED,
        )
        raise BillingError("REDEEM_CODE_ALREADY_USED", "兑换码已使用")

    if code.status in {REDEEM_CODE_STATUS_DISABLED, REDEEM_CODE_STATUS_ABANDONED} or batch.status == REDEEM_BATCH_STATUS_PAUSED:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_DISABLED,
        )
        raise BillingError("REDEEM_CODE_DISABLED", "兑换码不可用")

    if batch.status == REDEEM_BATCH_STATUS_EXPIRED or now >= batch.expire_at:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_EXPIRED,
        )
        raise BillingError("REDEEM_CODE_EXPIRED", "兑换码已失效")

    if now < batch.active_from:
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_NOT_ACTIVE,
        )
        raise BillingError("REDEEM_CODE_NOT_ACTIVE", "兑换码未到生效时间")

    daily_limit = batch.daily_limit_per_user if batch.daily_limit_per_user is not None else max(1, REDEEM_CODE_DEFAULT_DAILY_LIMIT)
    if not _check_daily_limit(db, user_id=user_id, limit=daily_limit, now=now):
        _append_redeem_attempt(
            db,
            user_id=user_id,
            batch_id=batch.id,
            code_id=code.id,
            code_mask=code.masked_code,
            success=False,
            failure_reason=REDEEM_FAIL_DAILY_LIMIT,
        )
        raise BillingError("REDEEM_CODE_DAILY_LIMIT_EXCEEDED", "超出当日兑换上限")

    account = get_or_create_wallet_account(db, user_id, for_update=True)
    account.balance_points += batch.face_value_points
    db.add(account)

    code.status = REDEEM_CODE_STATUS_REDEEMED
    code.redeemed_by_user_id = user_id
    code.redeemed_at = now
    db.add(code)
    db.flush()

    ledger = _append_ledger(
        db,
        user_id=user_id,
        operator_user_id=None,
        event_type=EVENT_REDEEM_CODE,
        delta_points=batch.face_value_points,
        balance_after=account.balance_points,
        redeem_batch_id=batch.id,
        redeem_code_id=code.id,
        redeem_code_mask=code.masked_code,
        note=f"redeem_code:{code.masked_code}",
    )

    _append_redeem_attempt(
        db,
        user_id=user_id,
        batch_id=batch.id,
        code_id=code.id,
        code_mask=code.masked_code,
        success=True,
    )
    return ledger
