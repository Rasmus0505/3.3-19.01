from __future__ import annotations

from typing import Any

from sqlalchemy.orm import DeclarativeBase


APP_SCHEMA = "app"
BUSINESS_TABLES = (
    "users",
    "user_login_events",
    "lessons",
    "lesson_sentences",
    "lesson_progress",
    "lesson_generation_tasks",
    "media_assets",
    "wallet_accounts",
    "wallet_ledger",
    "billing_model_rates",
    "translation_request_logs",
    "subtitle_settings",
    "faster_whisper_settings",
    "redeem_code_batches",
    "redeem_codes",
    "redeem_code_attempts",
    "admin_operation_logs",
    "announcements",
    "soe_results",
)


def is_sqlite_url(database_url: str) -> bool:
    return (database_url or "").strip().lower().startswith("sqlite")


def schema_name_for_url(database_url: str) -> str | None:
    return None if is_sqlite_url(database_url) else APP_SCHEMA


def sqlite_schema_translate_map(database_url: str) -> dict[str, str | None]:
    if is_sqlite_url(database_url):
        return {APP_SCHEMA: None}
    return {}


def table_args(*items: Any) -> tuple[Any, ...] | dict[str, str]:
    if items:
        return (*items, {"schema": APP_SCHEMA})
    return {"schema": APP_SCHEMA}


def schema_fk(reference: str) -> str:
    return f"{APP_SCHEMA}.{reference}"


class Base(DeclarativeBase):
    pass
