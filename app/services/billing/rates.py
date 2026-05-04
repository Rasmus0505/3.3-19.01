from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.models import (
    BillingModelRate,
    LLMUsageLog,
    TranslationRequestLog,
    WalletLedger,
)
from app.repositories.billing_rates import list_billing_rates as query_billing_rates

from .common import (
    build_rate_payload,
    logger,
    normalize_rate_yuan,
    yuan_to_compat_cents,
)
from .constants import (
    ADMIN_BILLING_MODEL_ORDER,
    DEFAULT_MODEL_RATES,
    DEFAULT_MT_COST_PER_1K_TOKENS_CENTS,
    MT_FLASH_MODEL,
    MT_MODEL_PREFIX,
    PUBLIC_BILLING_MODEL_ORDER,
    TRANSLATION_REQUEST_LOG_REQUIRED_COLUMN_SQL,
)
from .settings import ensure_default_subtitle_settings


def qualified_billing_rates_table(db: Session) -> str:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return BillingModelRate.__tablename__
    schema = BillingModelRate.__table__.schema
    return f"{schema}.{BillingModelRate.__tablename__}" if schema else BillingModelRate.__tablename__


def backfill_billing_rate_yuan_columns(db: Session) -> bool:
    column_names = billing_model_rates_columns(db)
    if not column_names:
        return False
    table_name = qualified_billing_rates_table(db)
    changed = False
    if "price_per_minute_yuan" in column_names and "points_per_minute" in column_names:
        result = db.execute(
            text(
                f"""
                UPDATE {table_name}
                SET price_per_minute_yuan = ROUND(COALESCE(points_per_minute, 0) / 100.0, 4)
                WHERE price_per_minute_yuan IS NULL
                   OR price_per_minute_yuan < 0
                   OR (price_per_minute_yuan = 0 AND COALESCE(points_per_minute, 0) > 0)
                """
            )
        )
        changed = changed or bool(getattr(result, "rowcount", 0))
    if "cost_per_minute_yuan" in column_names and "cost_per_minute_cents" in column_names:
        result = db.execute(
            text(
                f"""
                UPDATE {table_name}
                SET cost_per_minute_yuan = ROUND(COALESCE(cost_per_minute_cents, 0) / 100.0, 4)
                WHERE cost_per_minute_yuan IS NULL
                   OR cost_per_minute_yuan < 0
                """
            )
        )
        changed = changed or bool(getattr(result, "rowcount", 0))
    if changed:
        db.commit()
        logger.warning("[DEBUG] billing_rates.yuan_backfill applied=true")
    return changed


def ensure_billing_rate_yuan_columns(db: Session) -> None:
    bind = db.get_bind()
    if bind is None:
        return
    schema = None if bind.dialect.name == "sqlite" else BillingModelRate.__table__.schema
    inspector = inspect(bind)
    if not inspector.has_table(BillingModelRate.__tablename__, schema=schema):
        return

    existing_columns = {
        str(item.get("name") or "").strip()
        for item in inspector.get_columns(BillingModelRate.__tablename__, schema=schema)
    }
    table_name = qualified_billing_rates_table(db)
    alter_sql: list[str] = []
    if "price_per_minute_yuan" not in existing_columns:
        alter_sql.append(f"ALTER TABLE {table_name} ADD COLUMN price_per_minute_yuan NUMERIC(12,4) NOT NULL DEFAULT 0")
    if "cost_per_minute_yuan" not in existing_columns:
        alter_sql.append(f"ALTER TABLE {table_name} ADD COLUMN cost_per_minute_yuan NUMERIC(12,4) NOT NULL DEFAULT 0")

    if alter_sql:
        for sql in alter_sql:
            db.execute(text(sql))
        db.commit()
        logger.warning(
            "[DEBUG] billing_rates.yuan_columns_added missing=%s",
            ",".join(
                [
                    name
                    for name in ("price_per_minute_yuan", "cost_per_minute_yuan")
                    if name not in existing_columns
                ]
            ),
        )
    backfill_billing_rate_yuan_columns(db)


def ensure_legacy_sqlite_billing_columns(db: Session) -> None:
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
    if "cost_per_minute_cents" not in existing_columns:
        alter_sql.append("ALTER TABLE billing_model_rates ADD COLUMN cost_per_minute_cents INTEGER NOT NULL DEFAULT 0")
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
    if sqlite_billing_rates_requires_rebuild(db):
        rebuild_legacy_sqlite_billing_rates(db)
    TranslationRequestLog.__table__.create(bind=bind, checkfirst=True)


def ensure_legacy_sqlite_wallet_ledger_event_types(db: Session) -> None:
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
    if "amount_unit" not in existing_columns:
        alter_sql.append("ALTER TABLE wallet_ledger ADD COLUMN amount_unit VARCHAR(16) NOT NULL DEFAULT 'points'")

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
        cleanup_stale_sqlite_legacy_table(db, f"{table_name}__legacy")
        return
    rebuild_legacy_sqlite_wallet_ledger(db)


def translation_request_logs_schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return TranslationRequestLog.__table__.schema


def translation_request_logs_column_names(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    schema = translation_request_logs_schema_name(db)
    inspector = inspect(bind)
    if not inspector.has_table(TranslationRequestLog.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(TranslationRequestLog.__tablename__, schema=schema)}


def qualified_translation_request_logs_table(db: Session) -> str:
    schema = translation_request_logs_schema_name(db)
    return f"{schema}.{TranslationRequestLog.__tablename__}" if schema else TranslationRequestLog.__tablename__


def ensure_translation_request_logs_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("translation_request_logs schema repair missing bind")

    schema = translation_request_logs_schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(TranslationRequestLog.__tablename__, schema=schema):
        TranslationRequestLog.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        return True

    existing_columns = translation_request_logs_column_names(db)
    table_name = qualified_translation_request_logs_table(db)
    dialect_name = bind.dialect.name
    missing_columns = [item for item in TRANSLATION_REQUEST_LOG_REQUIRED_COLUMN_SQL if item[0] not in existing_columns]
    for column_name, sqlite_sql, default_sql in missing_columns:
        column_sql = sqlite_sql if dialect_name == "sqlite" else default_sql
        db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
        changed = True
    if missing_columns:
        db.commit()
        logger.warning(
            "[DEBUG] translation_request_logs.schema_repair_add_columns missing=%s",
            ",".join(item[0] for item in missing_columns),
        )
    return changed


def llm_usage_logs_schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return LLMUsageLog.__table__.schema


def llm_usage_logs_column_names(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    schema = llm_usage_logs_schema_name(db)
    inspector = inspect(bind)
    if not inspector.has_table(LLMUsageLog.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(LLMUsageLog.__tablename__, schema=schema)}


def qualified_llm_usage_logs_table(db: Session) -> str:
    schema = llm_usage_logs_schema_name(db)
    return f"{schema}.{LLMUsageLog.__tablename__}" if schema else LLMUsageLog.__tablename__


def ensure_llm_usage_logs_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        return False
    schema = llm_usage_logs_schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    table_name = qualified_llm_usage_logs_table(db)
    dialect_name = bind.dialect.name
    if not inspector.has_table(LLMUsageLog.__tablename__, schema=schema):
        LLMUsageLog.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        return True

    existing_columns = llm_usage_logs_column_names(db)
    for col_name, col_attr in LLMUsageLog.__table__.columns.items():
        if col_name not in existing_columns:
            col_type = sqlalchemy_column_type(col_attr.type, dialect_name)
            db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
            changed = True

    if dialect_name == "postgresql" and "input_text_preview" in existing_columns:
        try:
            result = db.execute(
                text(
                    "SELECT character_maximum_length FROM information_schema.columns "
                    "WHERE table_schema = :schema AND table_name = :table AND column_name = :col"
                ),
                {"schema": schema or "public", "table": LLMUsageLog.__tablename__, "col": "input_text_preview"},
            )
            row = result.fetchone()
            if row and row[0] is not None and row[0] < 300:
                db.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN input_text_preview TYPE VARCHAR(300)"))
                changed = True
                logger.warning("[DEBUG] llm_usage_logs.input_text_preview widened from %s to 300", row[0])
        except Exception as exc:
            logger.warning("[DEBUG] llm_usage_logs.input_text_preview resize check failed: %s", exc)

    if changed:
        db.commit()
        logger.warning("[DEBUG] llm_usage_logs.schema_repair applied=true")

    return changed


def sqlalchemy_column_type(col_type, dialect_name: str) -> str:
    from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text

    if isinstance(col_type, String):
        length = col_type.length or 255
        return f"VARCHAR({length})"
    if isinstance(col_type, Integer):
        return "INTEGER"
    if isinstance(col_type, BigInteger):
        return "BIGINT"
    if isinstance(col_type, Boolean):
        return "BOOLEAN"
    if isinstance(col_type, DateTime):
        return "TIMESTAMP"
    if isinstance(col_type, Text):
        return "TEXT"
    return "VARCHAR(255)"


def sqlite_billing_rates_requires_rebuild(db: Session) -> bool:
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
        or "ck_billing_rate_cost_non_negative" not in ddl
        or "ck_billing_rate_price_yuan_non_negative" not in ddl
        or "ck_billing_rate_cost_yuan_non_negative" not in ddl
        or "ck_billing_parallel_threshold_positive" not in ddl
        or "ck_billing_segment_seconds_positive" not in ddl
        or "ck_billing_max_concurrency_positive" not in ddl
    )


def rebuild_legacy_sqlite_billing_rates(db: Session) -> None:
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
                    cost_per_minute_cents,
                    price_per_minute_yuan,
                    cost_per_minute_yuan,
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
                        WHEN COALESCE(cost_per_minute_cents, 0) < 0 THEN 0
                        ELSE COALESCE(cost_per_minute_cents, 0)
                    END AS cost_per_minute_cents,
                    ROUND(
                        CASE
                            WHEN COALESCE(price_per_minute_yuan, 0) > 0 THEN COALESCE(price_per_minute_yuan, 0)
                            WHEN COALESCE(points_per_minute, 0) < 0 THEN 0
                            ELSE COALESCE(points_per_minute, 0) / 100.0
                        END,
                        4
                    ) AS price_per_minute_yuan,
                    ROUND(
                        CASE
                            WHEN COALESCE(cost_per_minute_yuan, 0) > 0 THEN COALESCE(cost_per_minute_yuan, 0)
                            WHEN COALESCE(cost_per_minute_cents, 0) < 0 THEN 0
                            ELSE COALESCE(cost_per_minute_cents, 0) / 100.0
                        END,
                        4
                    ) AS cost_per_minute_yuan,
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


def rebuild_legacy_sqlite_wallet_ledger(db: Session) -> None:
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
        drop_sqlite_indexes_for_table(db, legacy_table_name)
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
                    amount_unit,
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
                    COALESCE(amount_unit, 'points') AS amount_unit,
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


def drop_sqlite_indexes_for_table(db: Session, table_name: str) -> None:
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


def cleanup_stale_sqlite_legacy_table(db: Session, table_name: str) -> None:
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


def flash_mt_default_payload() -> dict[str, object]:
    for item in DEFAULT_MODEL_RATES:
        if str(item.get("model_name") or "").strip() == MT_FLASH_MODEL:
            return dict(item)
    return {
        "model_name": MT_FLASH_MODEL,
        "points_per_minute": 0,
        "price_per_minute_yuan": 0,
        "points_per_1k_tokens": DEFAULT_MT_COST_PER_1K_TOKENS_CENTS,
        "cost_per_minute_cents": 0,
        "cost_per_minute_yuan": 0,
        "cost_per_1k_tokens_input_cents": 1,
        "cost_per_1k_tokens_output_cents": 20,
        "billing_unit": "1k_tokens",
        "parallel_enabled": False,
        "parallel_threshold_seconds": 600,
        "segment_seconds": 300,
        "max_concurrency": 1,
    }


def billing_model_rates_columns(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    schema = None if bind.dialect.name == "sqlite" else BillingModelRate.__table__.schema
    inspector = inspect(bind)
    if not inspector.has_table(BillingModelRate.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(BillingModelRate.__tablename__, schema=schema)}


def cleanup_non_flash_mt_rates(db: Session, *, ensure_flash: bool) -> tuple[int, bool]:
    required_columns = {
        "model_name",
        "points_per_minute",
        "points_per_1k_tokens",
        "cost_per_minute_cents",
        "price_per_minute_yuan",
        "cost_per_minute_yuan",
        "billing_unit",
        "is_active",
        "parallel_enabled",
        "parallel_threshold_seconds",
        "segment_seconds",
        "max_concurrency",
    }
    column_names = billing_model_rates_columns(db)
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
        seed = build_rate_payload(flash_mt_default_payload())
        db.add(
            BillingModelRate(
                model_name=MT_FLASH_MODEL,
                price_per_minute_cents_legacy=int(seed.get("price_per_minute_cents") or 0),
                price_per_minute_yuan=seed["price_per_minute_yuan"],
                points_per_1k_tokens=int(seed.get("points_per_1k_tokens") or 0),
                cost_per_minute_cents_legacy=int(seed.get("cost_per_minute_cents") or 0),
                cost_per_minute_yuan=seed["cost_per_minute_yuan"],
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


def cleanup_removed_admin_rates(db: Session) -> int:
    removed_rows = list(
        row
        for row in db.scalars(select(BillingModelRate)).all()
        if str(getattr(row, "model_name", "") or "").strip() not in ADMIN_BILLING_MODEL_ORDER
        and not str(getattr(row, "model_name", "") or "").strip().startswith(MT_MODEL_PREFIX)
    )
    removed_count = len(removed_rows)
    for row in removed_rows:
        db.delete(row)
    if removed_count > 0:
        logger.warning("[DEBUG] billing_rates.removed_admin_models_cleanup removed=%s", removed_count)
    return removed_count


def sort_rates_by_model_order(rows: Iterable[BillingModelRate], model_order: tuple[str, ...]) -> list[BillingModelRate]:
    order_map = {model_name: index for index, model_name in enumerate(model_order)}
    return sorted(
        rows,
        key=lambda item: (
            order_map.get(str(getattr(item, "model_name", "") or "").strip(), len(order_map)),
            str(getattr(item, "model_name", "") or "").strip(),
        ),
    )


def list_admin_rates(db: Session) -> list[BillingModelRate]:
    rows = list(query_billing_rates(db))
    admin_model_names = set(ADMIN_BILLING_MODEL_ORDER)
    filtered_rows = [
        row
        for row in rows
        if str(getattr(row, "model_name", "") or "").strip() in admin_model_names
    ]
    return sort_rates_by_model_order(filtered_rows, ADMIN_BILLING_MODEL_ORDER)


def list_public_rates(db: Session) -> list[BillingModelRate]:
    rows = list(query_billing_rates(db, active_only=True))
    public_model_names = set(PUBLIC_BILLING_MODEL_ORDER)
    filtered_rows = [
        row
        for row in rows
        if str(getattr(row, "model_name", "") or "").strip() in public_model_names
        and str(getattr(row, "billing_unit", "minute") or "minute") == "minute"
    ]
    return sort_rates_by_model_order(filtered_rows, PUBLIC_BILLING_MODEL_ORDER)


def enforce_mt_flash_only_rates(db: Session) -> bool:
    removed_count, seeded_flash = cleanup_non_flash_mt_rates(db, ensure_flash=True)
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
    ensure_billing_rate_yuan_columns(db)
    ensure_legacy_sqlite_billing_columns(db)
    ensure_legacy_sqlite_wallet_ledger_event_types(db)
    ensure_translation_request_logs_schema(db)
    ensure_llm_usage_logs_schema(db)
    ensure_default_subtitle_settings(db)

    changed = False
    legacy_para = db.get(BillingModelRate, "paraformer-v2")
    if legacy_para is not None:
        db.delete(legacy_para)
        changed = True
    removed_admin_count = cleanup_removed_admin_rates(db)
    if removed_admin_count > 0:
        changed = True
    removed_count, seeded_flash = cleanup_non_flash_mt_rates(db, ensure_flash=False)
    if removed_count > 0 or seeded_flash:
        changed = True

    for item in defaults:
        seed = build_rate_payload(dict(item))
        model_name = str(seed.get("model_name") or "").strip()
        exists = db.get(BillingModelRate, model_name)
        if exists:
            row_changed = False
            if int(getattr(exists, "points_per_1k_tokens", 0) or 0) < 0:
                exists.points_per_1k_tokens = int(seed.get("points_per_1k_tokens") or 0)
                row_changed = True
            if not str(getattr(exists, "billing_unit", "") or "").strip():
                exists.billing_unit = str(seed.get("billing_unit") or "minute")
                row_changed = True
            if exists.parallel_enabled is None:
                exists.parallel_enabled = bool(seed.get("parallel_enabled"))
                row_changed = True
            if int(exists.parallel_threshold_seconds or 0) <= 0:
                exists.parallel_threshold_seconds = int(seed.get("parallel_threshold_seconds") or 600)
                row_changed = True
            if int(exists.segment_seconds or 0) <= 0:
                exists.segment_seconds = int(seed.get("segment_seconds") or 300)
                row_changed = True
            if int(exists.max_concurrency or 0) <= 0:
                exists.max_concurrency = int(seed.get("max_concurrency") or 2)
                row_changed = True
            if int(getattr(exists, "cost_per_minute_cents_legacy", 0) or 0) < 0:
                exists.cost_per_minute_cents_legacy = int(seed.get("cost_per_minute_cents") or 0)
                row_changed = True
            if normalize_rate_yuan(getattr(exists, "price_per_minute_yuan", None), fallback_cents=0) <= 0 and seed["price_per_minute_yuan"] > 0:
                exists.price_per_minute_yuan = seed["price_per_minute_yuan"]
                row_changed = True
            if normalize_rate_yuan(getattr(exists, "cost_per_minute_yuan", None), fallback_cents=0) <= 0 and seed["cost_per_minute_yuan"] > 0:
                exists.cost_per_minute_yuan = seed["cost_per_minute_yuan"]
                row_changed = True
            expected_price_cents = yuan_to_compat_cents(getattr(exists, "price_per_minute_yuan", None))
            if int(getattr(exists, "price_per_minute_cents_legacy", 0) or 0) != expected_price_cents:
                exists.price_per_minute_cents_legacy = expected_price_cents
                row_changed = True
            expected_cost_cents = yuan_to_compat_cents(getattr(exists, "cost_per_minute_yuan", None))
            if int(getattr(exists, "cost_per_minute_cents_legacy", 0) or 0) != expected_cost_cents:
                exists.cost_per_minute_cents_legacy = expected_cost_cents
                row_changed = True
            if row_changed:
                db.add(exists)
                changed = True
            continue
        db.add(
            BillingModelRate(
                model_name=model_name,
                price_per_minute_cents_legacy=int(seed.get("price_per_minute_cents") or 0),
                price_per_minute_yuan=seed["price_per_minute_yuan"],
                cost_per_1k_tokens_cents=int(seed.get("points_per_1k_tokens") or 0),
                cost_per_minute_cents_legacy=int(seed.get("cost_per_minute_cents") or 0),
                cost_per_minute_yuan=seed["cost_per_minute_yuan"],
                cost_per_1k_tokens_input_cents=int(seed.get("cost_per_1k_tokens_input_cents") or 0),
                cost_per_1k_tokens_output_cents=int(seed.get("cost_per_1k_tokens_output_cents") or 0),
                billing_unit=str(seed.get("billing_unit") or "minute"),
                is_active=True,
                parallel_enabled=bool(seed.get("parallel_enabled")),
                parallel_threshold_seconds=int(seed.get("parallel_threshold_seconds") or 600),
                segment_seconds=int(seed.get("segment_seconds") or 300),
                max_concurrency=int(seed.get("max_concurrency") or 2),
            )
        )
        changed = True
    if changed:
        db.commit()
