from __future__ import annotations

import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from time import perf_counter, time
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.security import JWT_SECRET


logger = logging.getLogger(__name__)

SQL_RESULT_LIMIT = 200
WRITE_CONFIRM_TEXT = "EXECUTE"
CONFIRM_TOKEN_TTL_SECONDS = 600
POSTGRES_STATEMENT_TIMEOUT_MS = 5000
POSTGRES_LOCK_TIMEOUT_MS = 2000

_QUOTE_PATTERN = re.compile(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"", re.DOTALL)
_LEADING_KEYWORD_PATTERN = re.compile(r"^\s*([a-zA-Z_]+)")
_FORBIDDEN_KEYWORDS = (
    "alter",
    "analyze",
    "call",
    "comment",
    "copy",
    "create",
    "do",
    "drop",
    "grant",
    "lock",
    "merge",
    "pragma",
    "reindex",
    "revoke",
    "savepoint",
    "show",
    "truncate",
    "vacuum",
)


class AdminSqlConsoleError(Exception):
    code = "SQL_CONSOLE_ERROR"
    message = "SQL 控台执行失败"
    status_code = 400

    def __init__(self, detail: Any = ""):
        self.detail = detail
        super().__init__(str(detail or self.message))


class AdminSqlConsoleValidationError(AdminSqlConsoleError):
    code = "INVALID_SQL"
    message = "SQL 不符合受控执行规则"
    status_code = 400


class AdminSqlConsoleConfirmationError(AdminSqlConsoleError):
    code = "SQL_CONFIRMATION_REQUIRED"
    message = "写操作需要先预检并完成二次确认"
    status_code = 400


class AdminSqlConsoleExecutionError(AdminSqlConsoleError):
    code = "SQL_EXECUTION_FAILED"
    message = "SQL 执行失败"
    status_code = 400


@dataclass
class PreparedSql:
    normalized_sql: str
    statement_mode: str
    requires_confirmation: bool
    summary: str
    target_tables: list[str]
    warnings: list[str]


def _normalize_sql(sql: str) -> str:
    normalized = str(sql or "").strip()
    if not normalized:
        raise AdminSqlConsoleValidationError("SQL 不能为空")
    normalized = re.sub(r";\s*$", "", normalized)
    if ";" in normalized:
        raise AdminSqlConsoleValidationError("仅允许执行单条 SQL，禁止多语句")
    if "--" in normalized or "/*" in normalized or "*/" in normalized:
        raise AdminSqlConsoleValidationError("暂不支持带注释的 SQL，请移除注释后重试")
    return normalized


def _strip_quoted_literals(sql: str) -> str:
    return _QUOTE_PATTERN.sub("''", sql)


def _classify_sql(normalized_sql: str) -> tuple[str, str]:
    stripped = _strip_quoted_literals(normalized_sql)
    lowered = stripped.lower()
    match = _LEADING_KEYWORD_PATTERN.search(lowered)
    if not match:
        raise AdminSqlConsoleValidationError("无法识别 SQL 动作，请检查语句开头")
    leading_keyword = match.group(1)
    for keyword in _FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{re.escape(keyword)}\b", lowered):
            raise AdminSqlConsoleValidationError(f"受控 SQL 禁止包含关键字 {keyword.upper()}")
    if leading_keyword == "with":
        if re.search(r"\b(insert|update|delete)\b", lowered):
            raise AdminSqlConsoleValidationError("WITH 语句当前仅支持查询，不支持带写操作的 CTE")
        if re.search(r"\bselect\b", lowered):
            return "read", lowered
        raise AdminSqlConsoleValidationError("当前仅支持 WITH ... SELECT 形式的查询")
    if leading_keyword in {"select", "explain"}:
        return "read", lowered
    if leading_keyword in {"insert", "update", "delete"}:
        return "write", lowered
    raise AdminSqlConsoleValidationError(f"当前不支持 {leading_keyword.upper()} 语句")


def _extract_target_tables(statement_mode: str, lowered_sql: str) -> list[str]:
    patterns: list[str]
    if statement_mode == "read":
        patterns = [r"\bfrom\s+([a-zA-Z_][\w.]*)", r"\bjoin\s+([a-zA-Z_][\w.]*)"]
    elif lowered_sql.startswith("insert"):
        patterns = [r"\binsert\s+into\s+([a-zA-Z_][\w.]*)"]
    elif lowered_sql.startswith("update"):
        patterns = [r"\bupdate\s+([a-zA-Z_][\w.]*)"]
    else:
        patterns = [r"\bdelete\s+from\s+([a-zA-Z_][\w.]*)"]

    tables: list[str] = []
    for pattern in patterns:
        for value in re.findall(pattern, lowered_sql):
            cleaned = str(value or "").strip().strip(",")
            if cleaned and cleaned not in tables:
                tables.append(cleaned)
    return tables[:5]


def _build_summary(statement_mode: str, target_tables: list[str]) -> str:
    verb = "READ" if statement_mode == "read" else "WRITE"
    if not target_tables:
        return f"{verb} SQL"
    return f"{verb} {', '.join(target_tables[:3])}"


def _build_warnings(statement_mode: str) -> list[str]:
    warnings = [
        "仅允许单条 SQL。",
        f"结果最多返回 {SQL_RESULT_LIMIT} 行。",
    ]
    if statement_mode == "write":
        warnings.extend(
            [
                "写操作会直接作用于当前业务数据库。",
                f"执行前必须输入确认词 {WRITE_CONFIRM_TEXT}。",
            ]
        )
    return warnings


def prepare_sql(sql: str) -> PreparedSql:
    normalized_sql = _normalize_sql(sql)
    statement_mode, lowered_sql = _classify_sql(normalized_sql)
    target_tables = _extract_target_tables(statement_mode, lowered_sql)
    prepared = PreparedSql(
        normalized_sql=normalized_sql,
        statement_mode=statement_mode,
        requires_confirmation=statement_mode == "write",
        summary=_build_summary(statement_mode, target_tables),
        target_tables=target_tables,
        warnings=_build_warnings(statement_mode),
    )
    logger.info(
        "[DEBUG] sql_console.prepare mode=%s tables=%s summary=%s",
        prepared.statement_mode,
        ",".join(prepared.target_tables),
        prepared.summary,
    )
    return prepared


def _build_token_signature(normalized_sql: str, statement_mode: str, issued_at: int) -> str:
    sql_hash = hashlib.sha256(normalized_sql.encode("utf-8")).hexdigest()
    payload = f"{issued_at}:{statement_mode}:{sql_hash}"
    return hmac.new(JWT_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_confirm_token(normalized_sql: str, statement_mode: str) -> str:
    issued_at = int(time())
    signature = _build_token_signature(normalized_sql, statement_mode, issued_at)
    return f"{issued_at}.{signature}"


def verify_confirm_token(normalized_sql: str, statement_mode: str, token: str) -> None:
    raw_token = str(token or "").strip()
    if "." not in raw_token:
        raise AdminSqlConsoleConfirmationError("缺少有效的确认令牌，请重新预检 SQL")
    issued_at_text, signature = raw_token.split(".", 1)
    try:
        issued_at = int(issued_at_text)
    except Exception as exc:
        raise AdminSqlConsoleConfirmationError("确认令牌格式无效，请重新预检 SQL") from exc
    if int(time()) - issued_at > CONFIRM_TOKEN_TTL_SECONDS:
        raise AdminSqlConsoleConfirmationError("确认令牌已过期，请重新预检 SQL")
    expected = _build_token_signature(normalized_sql, statement_mode, issued_at)
    if not hmac.compare_digest(signature, expected):
        raise AdminSqlConsoleConfirmationError("确认令牌无效，请重新预检 SQL")


def _serialize_rows(result) -> tuple[list[dict[str, Any]], bool]:
    rows = result.mappings().fetchmany(SQL_RESULT_LIMIT + 1)
    truncated = len(rows) > SQL_RESULT_LIMIT
    visible_rows = rows[:SQL_RESULT_LIMIT]
    return [jsonable_encoder(dict(item)) for item in visible_rows], truncated


def _apply_postgres_timeouts(db: Session) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return
    db.execute(text(f"SET LOCAL statement_timeout = {POSTGRES_STATEMENT_TIMEOUT_MS}"))
    db.execute(text(f"SET LOCAL lock_timeout = {POSTGRES_LOCK_TIMEOUT_MS}"))


def execute_sql(
    db: Session,
    *,
    sql: str,
    confirm_token: str = "",
    confirm_text: str = "",
) -> dict[str, Any]:
    prepared = prepare_sql(sql)
    if prepared.requires_confirmation:
        verify_confirm_token(prepared.normalized_sql, prepared.statement_mode, confirm_token)
        if str(confirm_text or "").strip().upper() != WRITE_CONFIRM_TEXT:
            raise AdminSqlConsoleConfirmationError("确认词不正确，写操作已取消")

    try:
        _apply_postgres_timeouts(db)
        started_at = perf_counter()
        result = db.execute(text(prepared.normalized_sql))
        duration_ms = int((perf_counter() - started_at) * 1000)

        columns = [{"name": name} for name in result.keys()]
        rows: list[dict[str, Any]] = []
        truncated = False
        if result.returns_rows:
            rows, truncated = _serialize_rows(result)

        affected_rows = None
        if prepared.statement_mode == "write":
            if result.rowcount is not None and int(result.rowcount) >= 0:
                affected_rows = int(result.rowcount)
            else:
                affected_rows = len(rows)

        logger.info(
            "[DEBUG] sql_console.execute mode=%s affected_rows=%s row_count=%s truncated=%s duration_ms=%s",
            prepared.statement_mode,
            affected_rows,
            len(rows),
            truncated,
            duration_ms,
        )
        return {
            "prepared": prepared,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "affected_rows": affected_rows,
            "truncated": truncated,
            "duration_ms": duration_ms,
        }
    except AdminSqlConsoleError:
        raise
    except SQLAlchemyError as exc:
        raise AdminSqlConsoleExecutionError(str(exc)) from exc
