from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi.responses import JSONResponse

from app.schemas import ErrorResponse

if TYPE_CHECKING:
    from app.services.media import MediaError as _MediaError


# ── 统一业务异常层级 ──────────────────────────────────────────────────────


class AppError(Exception):
    """应用业务异常基类。"""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"
    message: str = "Internal server error"

    def __init__(self, message: str | None = None, detail: Any = None):
        self.message = message or self.__class__.message
        self.detail = detail
        super().__init__(self.message)


class AuthError(AppError):
    status_code = 401
    code = "AUTH_ERROR"
    message = "Unauthorized"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "Resource not found"


class ValidationError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = "Validation error"


class LessonError(AppError):
    status_code = 400
    code = "LESSON_ERROR"
    message = "Lesson operation error"


class BillingError(AppError):
    """与 app.services.billing.BillingError 并存，供核心层使用。"""
    status_code = 402
    code = "BILLING_ERROR"
    message = "Billing error"


class AdminError(AppError):
    status_code = 403
    code = "ADMIN_ERROR"
    message = "Admin operation error"


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
