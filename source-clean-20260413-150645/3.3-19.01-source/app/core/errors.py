"""核心错误模块 - 向后兼容模块。

此文件保留以支持现有代码导入路径，未来将逐步迁移到 app/exceptions/。

建议新代码直接导入：
    from app.exceptions import AppError, AuthError, NotFoundError, ...
    from app.exceptions import BillingError, LessonError, AsrError, ...
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi.responses import JSONResponse

from app.schemas import ErrorResponse

if TYPE_CHECKING:
    from app.services.media import MediaError as _MediaError


# ── 重新导出异常类（从 app.exceptions）────────────────────────────────────

from app.exceptions.base import (
    AppError,
    AuthError,
    NotFoundError,
    ValidationError,
    LessonError,
    AdminError,
)


class BillingError(AppError):
    """与 app.services.billing.BillingError 并存，供核心层使用。"""
    status_code = 402
    code = "BILLING_ERROR"
    message = "Billing error"


# ── 标准错误响应构造 ──────────────────────────────────────────────────────


def error_response(status_code: int, code: str, message: str, detail: Any = "") -> JSONResponse:
    """构建符合项目规范的 JSON 错误响应。"""
    payload = ErrorResponse(ok=False, error_code=code, message=message, detail=detail).model_dump()
    return JSONResponse(status_code=status_code, content=payload)


# ── 异常映射 ───────────────────────────────────────────────────────────────


def map_media_error(exc: Exception) -> JSONResponse:
    """将 MediaError 映射为标准错误响应。"""
    if not hasattr(exc, "code"):
        return error_response(500, "INTERNAL_ERROR", str(exc))
    code = exc.code
    if code == "FILE_TOO_LARGE":
        return error_response(413, code, exc.message, getattr(exc, "detail", None))
    if code in {"INVALID_FILE_TYPE", "EMPTY_FILE", "SENTENCE_CLIP_FAILED", "FFPROBE_FAILED"}:
        return error_response(400, code, exc.message, getattr(exc, "detail", None))
    if code in {"COMMAND_MISSING", "FFMPEG_LIBOPUS_MISSING"}:
        return error_response(503, code, exc.message, getattr(exc, "detail", None))
    if code == "COMMAND_TIMEOUT":
        return error_response(504, code, exc.message, getattr(exc, "detail", None))
    return error_response(500, code, exc.message, getattr(exc, "detail", None))


def map_billing_error(exc: Exception) -> JSONResponse:
    """将 BillingError 映射为标准错误响应。"""
    if not hasattr(exc, "code"):
        return error_response(500, "INTERNAL_ERROR", str(exc))
    code = exc.code
    if code in {"INSUFFICIENT_BALANCE", "BILLING_RATE_DISABLED"}:
        return error_response(400, code, exc.message, getattr(exc, "detail", None))
    if code in {
        "BILLING_RATE_NOT_FOUND",
        "INVALID_REASON",
        "INVALID_POINTS",
        "INVALID_QUANTITY",
        "INVALID_DAILY_LIMIT",
        "INVALID_TIME_RANGE",
        "INVALID_REDEEM_CODE",
        "REDEEM_BATCH_NOT_FOUND",
        "REDEEM_CODE_NOT_FOUND",
        "REDEEM_CODE_ALREADY_USED",
        "REDEEM_CODE_EXPIRED",
        "REDEEM_CODE_DISABLED",
        "REDEEM_CODE_NOT_ACTIVE",
        "REDEEM_CODE_DAILY_LIMIT_EXCEEDED",
        "INVALID_STATUS",
    }:
        return error_response(400, code, exc.message, getattr(exc, "detail", None))
    return error_response(500, code, exc.message, getattr(exc, "detail", None))
