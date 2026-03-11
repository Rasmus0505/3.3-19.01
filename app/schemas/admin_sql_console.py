from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AdminSqlPrepareRequest(BaseModel):
    sql: str = ""


class AdminSqlResultColumn(BaseModel):
    name: str


class AdminSqlPrepareResponse(BaseModel):
    ok: bool = True
    statement_mode: str
    allowed: bool = True
    requires_confirmation: bool = False
    summary: str = ""
    target_tables: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    confirm_token: str = ""
    confirm_text: str = ""
    result_limit: int


class AdminSqlExecuteRequest(BaseModel):
    sql: str = ""
    confirm_token: str = ""
    confirm_text: str = ""


class AdminSqlExecuteResponse(BaseModel):
    ok: bool = True
    statement_mode: str
    summary: str = ""
    target_tables: list[str] = Field(default_factory=list)
    result_limit: int
    truncated: bool = False
    row_count: int = 0
    affected_rows: int | None = None
    duration_ms: int = 0
    columns: list[AdminSqlResultColumn] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)

