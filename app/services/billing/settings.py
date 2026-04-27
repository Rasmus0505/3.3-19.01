from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.core.config import LESSON_DEFAULT_ASR_MODEL
from app.models import SubtitleSetting
from app.services.asr_model_registry import get_supported_upload_asr_model_keys

from .common import SubtitleSettingsSnapshot, logger, now_local
from .constants import DEFAULT_SUBTITLE_SETTINGS, SUBTITLE_SETTINGS_REQUIRED_COLUMN_SQL


def ensure_default_subtitle_settings(db: Session) -> SubtitleSetting:
    ensure_subtitle_settings_schema(db)
    try:
        row = db.get(SubtitleSetting, 1)
    except Exception as exc:
        if is_missing_subtitle_settings_error(exc):
            ensure_subtitle_settings_schema(db)
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

    changed = normalize_subtitle_settings_row(row)
    if changed:
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_subtitle_settings(db: Session) -> SubtitleSetting:
    ensure_subtitle_settings_schema(db)
    try:
        row = db.get(SubtitleSetting, 1)
    except Exception as exc:
        if is_missing_subtitle_settings_error(exc):
            ensure_subtitle_settings_schema(db)
            db.expire_all()
            row = db.get(SubtitleSetting, 1)
        else:
            logger.exception("[DEBUG] subtitle_settings.load_failed detail=%s", str(exc)[:400])
            raise
    if row is None:
        row = ensure_default_subtitle_settings(db)
    elif normalize_subtitle_settings_row(row):
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_subtitle_settings_snapshot(db: Session) -> SubtitleSettingsSnapshot:
    row = get_subtitle_settings(db)
    return SubtitleSettingsSnapshot(
        default_asr_model=str(getattr(row, "default_asr_model", "") or LESSON_DEFAULT_ASR_MODEL),
        subtitle_split_enabled=bool(row.subtitle_split_enabled),
        subtitle_split_target_words=int(row.subtitle_split_target_words),
        subtitle_split_max_words=int(row.subtitle_split_max_words),
        translation_batch_max_chars=max(1, min(12000, int(getattr(row, "translation_batch_max_chars", 2600) or 2600))),
    )


def get_default_asr_model(db: Session) -> str:
    row = get_subtitle_settings(db)
    return str(getattr(row, "default_asr_model", "") or "").strip() or LESSON_DEFAULT_ASR_MODEL


def is_missing_subtitle_settings_error(exc: Exception) -> bool:
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


def self_heal_subtitle_settings(db: Session) -> SubtitleSetting:
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
        ensure_subtitle_settings_schema(db)
        row = db.get(SubtitleSetting, 1)
        if row is None:
            row = SubtitleSetting(id=1, **DEFAULT_SUBTITLE_SETTINGS)
            db.add(row)
            db.commit()
            db.refresh(row)
        elif normalize_subtitle_settings_row(row):
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


def subtitle_settings_schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return SubtitleSetting.__table__.schema


def qualified_subtitle_settings_table(db: Session) -> str:
    schema = subtitle_settings_schema_name(db)
    return f"{schema}.{SubtitleSetting.__tablename__}" if schema else SubtitleSetting.__tablename__


def subtitle_settings_column_names(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    inspector = inspect(bind)
    schema = subtitle_settings_schema_name(db)
    if not inspector.has_table(SubtitleSetting.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(SubtitleSetting.__tablename__, schema=schema)}


def ensure_subtitle_settings_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("subtitle_settings schema repair missing bind")

    schema = subtitle_settings_schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(SubtitleSetting.__tablename__, schema=schema):
        logger.warning("[DEBUG] subtitle_settings.schema_repair_create_table")
        db.rollback()
        SubtitleSetting.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    existing_columns = subtitle_settings_column_names(db)
    table_name = qualified_subtitle_settings_table(db)
    dialect_name = bind.dialect.name
    missing_columns = [item for item in SUBTITLE_SETTINGS_REQUIRED_COLUMN_SQL if item[0] not in existing_columns]

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

    if backfill_subtitle_settings_values(db):
        changed = True
    return changed


def backfill_subtitle_settings_values(db: Session) -> bool:
    table_name = qualified_subtitle_settings_table(db)
    column_names = subtitle_settings_column_names(db)
    if not column_names:
        return False

    dialect_name = str((db.get_bind().dialect.name if db.get_bind() is not None else "") or "").lower()
    changed = False
    for column_name, default_value in DEFAULT_SUBTITLE_SETTINGS.items():
        if column_name not in column_names:
            continue
        if isinstance(default_value, bool):
            where_sql = f"{column_name} IS NULL"
            update_sql = text(f"UPDATE {table_name} SET {column_name} = :default_value WHERE {where_sql}")
            params = {"default_value": int(default_value) if dialect_name == "sqlite" else bool(default_value)}
        elif column_name == "default_asr_model":
            supported_asr_sql = "', '".join(str(item).replace("'", "''") for item in get_supported_upload_asr_model_keys())
            where_sql = (
                f"{column_name} IS NULL OR TRIM({column_name}) = '' "
                f"OR TRIM({column_name}) NOT IN ('{supported_asr_sql}')"
            )
            update_sql = text(f"UPDATE {table_name} SET {column_name} = :default_value WHERE {where_sql}")
            params = {"default_value": str(default_value or LESSON_DEFAULT_ASR_MODEL)}
        elif column_name == "translation_batch_max_chars":
            where_sql = f"{column_name} IS NULL OR {column_name} <= 0 OR {column_name} > 12000"
            update_sql = text(f"UPDATE {table_name} SET {column_name} = {int(default_value)} WHERE {where_sql}")
            params = None
        else:
            where_sql = f"{column_name} IS NULL OR {column_name} <= 0"
            update_sql = text(f"UPDATE {table_name} SET {column_name} = {int(default_value)} WHERE {where_sql}")
            params = None
        needs_backfill = db.execute(text(f"SELECT 1 FROM {table_name} WHERE {where_sql} LIMIT 1")).scalar()
        if not needs_backfill:
            continue
        result = db.execute(update_sql, params or {})
        changed = changed or bool(getattr(result, "rowcount", 0))

    if "updated_at" in column_names:
        needs_updated_at_backfill = db.execute(text(f"SELECT 1 FROM {table_name} WHERE updated_at IS NULL LIMIT 1")).scalar()
        if needs_updated_at_backfill:
            result = db.execute(text(f"UPDATE {table_name} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
            changed = changed or bool(getattr(result, "rowcount", 0))

    if changed:
        db.commit()
        logger.warning("[DEBUG] subtitle_settings.schema_repair_backfill applied=true")
    return changed


def normalize_subtitle_settings_row(row: SubtitleSetting) -> bool:
    changed = False
    for key, value in DEFAULT_SUBTITLE_SETTINGS.items():
        current = getattr(row, key)
        if isinstance(value, bool):
            if current is None:
                setattr(row, key, value)
                changed = True
            continue
        if key == "default_asr_model":
            normalized_value = str(current or "").strip() or str(value or LESSON_DEFAULT_ASR_MODEL)
            if normalized_value not in set(get_supported_upload_asr_model_keys()):
                normalized_value = str(value or LESSON_DEFAULT_ASR_MODEL)
            if normalized_value != current:
                setattr(row, key, normalized_value)
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
        row.updated_at = now_local()
        changed = True
    return changed
