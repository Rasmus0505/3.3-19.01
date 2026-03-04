from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse

from app.schemas import ErrorResponse
from app.services.billing import BillingError
from app.services.media import MediaError


def error_response(status_code: int, code: str, message: str, detail: Any = "") -> JSONResponse:
    payload = ErrorResponse(ok=False, error_code=code, message=message, detail=detail).model_dump()
    return JSONResponse(status_code=status_code, content=payload)


def map_media_error(exc: MediaError) -> JSONResponse:
    if exc.code == "FILE_TOO_LARGE":
        return error_response(413, exc.code, exc.message, exc.detail)
    if exc.code in {"INVALID_FILE_TYPE", "EMPTY_FILE", "SENTENCE_CLIP_FAILED", "FFPROBE_FAILED"}:
        return error_response(400, exc.code, exc.message, exc.detail)
    return error_response(500, exc.code, exc.message, exc.detail)


def map_billing_error(exc: BillingError) -> JSONResponse:
    if exc.code in {"INSUFFICIENT_BALANCE", "BILLING_RATE_DISABLED"}:
        return error_response(400, exc.code, exc.message, exc.detail)
    if exc.code in {
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
        return error_response(400, exc.code, exc.message, exc.detail)
    return error_response(500, exc.code, exc.message, exc.detail)
