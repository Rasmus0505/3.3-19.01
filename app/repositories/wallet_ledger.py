from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.repositories.admin import list_translation_logs as query_translation_logs
from app.repositories.admin import list_wallet_logs as query_wallet_logs


def list_wallet_ledger_rows(
    db: Session,
    *,
    user_email: str,
    event_type: str,
    page: int,
    page_size: int,
    date_from: datetime | None,
    date_to: datetime | None,
):
    return query_wallet_logs(
        db,
        user_email=user_email,
        event_type=event_type,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
    )


def list_translation_request_rows(
    db: Session,
    *,
    user_email: str,
    task_id: str,
    lesson_id: int | None,
    success: str,
    page: int,
    page_size: int,
    date_from: datetime | None,
    date_to: datetime | None,
):
    return query_translation_logs(
        db,
        user_email=user_email,
        task_id=task_id,
        lesson_id=lesson_id,
        success=success,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
    )
