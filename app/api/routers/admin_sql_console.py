from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.schemas.admin_sql_console import (
    AdminSqlExecuteRequest,
    AdminSqlExecuteResponse,
    AdminSqlPrepareRequest,
    AdminSqlPrepareResponse,
)
from app.services.admin_sql_console import (
    AdminSqlConsoleError,
    SQL_RESULT_LIMIT,
    WRITE_CONFIRM_TEXT,
    execute_sql,
    issue_confirm_token,
    prepare_sql,
)
from app.services.billing_service import append_admin_operation_log


router = APIRouter(prefix="/api/admin/sql-console", tags=["admin"])
logger = logging.getLogger(__name__)


def _audit_prepare(
    db: Session,
    *,
    current_admin: User,
    sql: str,
    status: str,
    detail: dict,
    note: str,
) -> None:
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="sql_console_prepare",
        target_type="sql_console",
        target_id=status,
        before_value={"sql": sql, "operator_user_email": current_admin.email},
        after_value=detail,
        note=note,
    )
    db.commit()


def _audit_execute(
    db: Session,
    *,
    current_admin: User,
    sql: str,
    summary: str,
    detail: dict,
    note: str,
) -> None:
    append_admin_operation_log(
        db,
        operator_user_id=current_admin.id,
        action_type="sql_console_execute",
        target_type="sql_console",
        target_id=summary[:64],
        before_value={"sql": sql, "operator_user_email": current_admin.email},
        after_value=detail,
        note=note,
    )
    db.commit()


@router.post(
    "/prepare",
    response_model=AdminSqlPrepareResponse,
    responses={400: {"description": "Invalid SQL"}, 401: {"description": "Unauthorized"}, 403: {"description": "Forbidden"}},
)
def admin_sql_prepare(
    payload: AdminSqlPrepareRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        prepared = prepare_sql(payload.sql)
        confirm_token = issue_confirm_token(prepared.normalized_sql, prepared.statement_mode) if prepared.requires_confirmation else ""
        response = AdminSqlPrepareResponse(
            statement_mode=prepared.statement_mode,
            requires_confirmation=prepared.requires_confirmation,
            summary=prepared.summary,
            target_tables=prepared.target_tables,
            warnings=prepared.warnings,
            confirm_token=confirm_token,
            confirm_text=WRITE_CONFIRM_TEXT if prepared.requires_confirmation else "",
            result_limit=SQL_RESULT_LIMIT,
        )
        _audit_prepare(
            db,
            current_admin=current_admin,
            sql=prepared.normalized_sql,
            status="allowed",
            detail={
                "allowed": True,
                "statement_mode": prepared.statement_mode,
                "summary": prepared.summary,
                "target_tables": prepared.target_tables,
                "warnings": prepared.warnings,
            },
            note=prepared.statement_mode,
        )
        return response
    except AdminSqlConsoleError as exc:
        db.rollback()
        logger.warning("[DEBUG] sql_console.prepare_rejected detail=%s", str(exc.detail)[:400])
        _audit_prepare(
            db,
            current_admin=current_admin,
            sql=str(payload.sql or "").strip(),
            status="rejected",
            detail={"allowed": False, "error_code": exc.code, "detail": exc.detail},
            note="rejected",
        )
        return error_response(exc.status_code, exc.code, exc.message, exc.detail)


@router.post(
    "/execute",
    response_model=AdminSqlExecuteResponse,
    responses={400: {"description": "Execution failed"}, 401: {"description": "Unauthorized"}, 403: {"description": "Forbidden"}},
)
def admin_sql_execute(
    payload: AdminSqlExecuteRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    try:
        execution = execute_sql(
            db,
            sql=payload.sql,
            confirm_token=payload.confirm_token,
            confirm_text=payload.confirm_text,
        )
        prepared = execution["prepared"]
        response = AdminSqlExecuteResponse(
            statement_mode=prepared.statement_mode,
            summary=prepared.summary,
            target_tables=prepared.target_tables,
            result_limit=SQL_RESULT_LIMIT,
            truncated=bool(execution["truncated"]),
            row_count=int(execution["row_count"]),
            affected_rows=execution["affected_rows"],
            duration_ms=int(execution["duration_ms"]),
            columns=execution["columns"],
            rows=execution["rows"],
        )
        _audit_execute(
            db,
            current_admin=current_admin,
            sql=prepared.normalized_sql,
            summary=prepared.summary,
            detail={
                "statement_mode": prepared.statement_mode,
                "summary": prepared.summary,
                "target_tables": prepared.target_tables,
                "row_count": execution["row_count"],
                "affected_rows": execution["affected_rows"],
                "truncated": execution["truncated"],
                "duration_ms": execution["duration_ms"],
            },
            note=prepared.statement_mode,
        )
        return response
    except AdminSqlConsoleError as exc:
        db.rollback()
        logger.warning("[DEBUG] sql_console.execute_failed detail=%s", str(exc.detail)[:400])
        _audit_execute(
            db,
            current_admin=current_admin,
            sql=str(payload.sql or "").strip(),
            summary="failed",
            detail={"error_code": exc.code, "detail": exc.detail},
            note="failed",
        )
        return error_response(exc.status_code, exc.code, exc.message, exc.detail)

