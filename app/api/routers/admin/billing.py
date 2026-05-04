from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.api.serializers import to_rate_item
from app.core.errors import error_response
from app.core.timezone import to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import BillingModelRate, User
from app.repositories.wallet_ledger import (
    list_translation_request_rows,
    list_wallet_ledger_rows,
)
from app.schemas import (
    AdminBillingRatesResponse,
    AdminBillingRateUpdateRequest,
    AdminRuntimeReadinessItem,
    AdminRuntimeReadinessResponse,
    AdminTranslationLogItem,
    AdminTranslationLogsResponse,
    AdminWalletLogsResponse,
    ErrorResponse,
    WalletLedgerItem,
)
from app.services.asr_model_registry import list_asr_models_with_status
from app.services.billing import (
    enforce_mt_flash_only_rates,
    ensure_default_billing_rates,
    list_admin_rates,
    normalize_rate_yuan,
    yuan_to_compat_cents,
)
from app.services.llm_usage_service import get_llm_usage_summary, list_all_llm_usage

from .shared import parse_optional_lesson_id

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

_ADMIN_RUNTIME_READINESS_MODELS = (
    {
        "model_key": "faster-whisper-medium",
        "display_name": "Bottle 1.0",
        "runtime_kind": "desktop_local",
    },
    {
        "model_key": "qwen3-asr-flash-filetrans",
        "display_name": "Bottle 2.0",
        "runtime_kind": "cloud_api",
    },
)


@router.get(
    "/wallet-logs",
    response_model=AdminWalletLogsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_wallet_logs(
    user_email: str = "",
    event_type: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)
    logger.debug(
        "[DEBUG] /api/admin/wallet-logs normalized filters date_from=%s date_to=%s",
        normalized_date_from.isoformat() if normalized_date_from else "",
        normalized_date_to.isoformat() if normalized_date_to else "",
    )

    payload = list_wallet_ledger_rows(
        db,
        user_email=user_email,
        event_type=event_type,
        page=page,
        page_size=page_size,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
    )
    total = int(payload["total"])
    rows = payload["rows"]

    items = [
        WalletLedgerItem(
            id=ledger.id,
            user_id=ledger.user_id,
            user_email=email,
            operator_user_id=ledger.operator_user_id,
            event_type=ledger.event_type,
            delta_points=int(ledger.delta_points),
            balance_after=int(ledger.balance_after),
            delta_amount_cents=int(getattr(ledger, "delta_amount_cents", ledger.delta_points)),
            balance_after_amount_cents=int(getattr(ledger, "balance_after_amount_cents", ledger.balance_after)),
            amount_unit=str(getattr(ledger, "amount_unit", "cents") or "cents"),
            model_name=ledger.model_name,
            duration_ms=ledger.duration_ms,
            lesson_id=ledger.lesson_id,
            redeem_batch_id=ledger.redeem_batch_id,
            redeem_code_id=ledger.redeem_code_id,
            redeem_code_mask=ledger.redeem_code_mask,
            note=ledger.note,
            created_at=to_shanghai_aware(ledger.created_at),
        )
        for ledger, email in rows
    ]
    return AdminWalletLogsResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/translation-logs",
    response_model=AdminTranslationLogsResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_translation_logs(
    user_email: str = "",
    task_id: str = "",
    lesson_id: str = "",
    success: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_lesson_id, parse_error = parse_optional_lesson_id(lesson_id)
    if parse_error is not None:
        return parse_error
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)
    logger.debug(
        "[DEBUG] /api/admin/translation-logs normalized filters date_from=%s date_to=%s task_id=%s lesson_id=%s success=%s",
        normalized_date_from.isoformat() if normalized_date_from else "",
        normalized_date_to.isoformat() if normalized_date_to else "",
        task_id,
        lesson_id,
        success,
    )

    payload = list_translation_request_rows(
        db,
        user_email=user_email,
        task_id=task_id,
        lesson_id=normalized_lesson_id,
        success=success,
        page=page,
        page_size=page_size,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
    )
    total = int(payload["total"])
    rows = payload["rows"]
    items = [
        AdminTranslationLogItem(
            id=row.id,
            user_email=email or "-",
            task_id=row.task_id,
            lesson_id=row.lesson_id,
            sentence_idx=int(row.sentence_idx),
            attempt_no=int(row.attempt_no),
            provider=row.provider,
            model_name=row.model_name,
            base_url=row.base_url,
            input_text_preview=row.input_text_preview,
            provider_request_id=row.provider_request_id,
            status_code=row.status_code,
            finish_reason=row.finish_reason,
            prompt_tokens=int(row.prompt_tokens),
            completion_tokens=int(row.completion_tokens),
            total_tokens=int(row.total_tokens),
            success=bool(row.success),
            error_code=row.error_code,
            error_message=row.error_message,
            started_at=to_shanghai_aware(row.started_at),
            finished_at=to_shanghai_aware(row.finished_at),
            created_at=to_shanghai_aware(row.created_at),
        )
        for row, email in rows
    ]
    return AdminTranslationLogsResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=items,
        summary_cards=payload.get("summary_cards", []),
        charts=payload.get("charts", []),
    )


@router.get(
    "/billing-rates",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_billing_rates(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    ensure_default_billing_rates(db)
    enforce_mt_flash_only_rates(db)
    rates = list_admin_rates(db)
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(item) for item in rates])


@router.get(
    "/runtime-readiness",
    response_model=AdminRuntimeReadinessResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_runtime_readiness(_: User = Depends(get_admin_user)):
    descriptors = {
        str(item.get("model_key") or "").strip(): item
        for item in list_asr_models_with_status()
    }
    items = []
    for meta in _ADMIN_RUNTIME_READINESS_MODELS:
        descriptor = descriptors.get(meta["model_key"], {})
        items.append(
            AdminRuntimeReadinessItem(
                model_key=meta["model_key"],
                display_name=str(descriptor.get("display_name") or meta["display_name"]),
                runtime_kind=meta["runtime_kind"],
                status=str(descriptor.get("status") or "unsupported"),
                available=bool(descriptor.get("available")),
                message=str(descriptor.get("message") or "未返回运行状态。"),
                actions=list(descriptor.get("actions") or []),
            )
        )
    return AdminRuntimeReadinessResponse(ok=True, items=items)


@router.put(
    "/billing-rates/{model_name}",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_update_billing_rate(
    model_name: str,
    payload: AdminBillingRateUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    normalized_model_name = (model_name or "").strip().lower()
    if normalized_model_name.startswith("qwen-mt-") and normalized_model_name != "qwen-mt-flash":
        return error_response(400, "MT_MODEL_DEPRECATED", "翻译模型仅支持 qwen-mt-flash", model_name)
    ensure_default_billing_rates(db)
    enforce_mt_flash_only_rates(db)
    managed_model_names = {
        str(item.model_name or "").strip().lower()
        for item in list_admin_rates(db)
    }
    if normalized_model_name not in managed_model_names:
        return error_response(400, "BILLING_RATE_NOT_MANAGEABLE", "该模型不在后台可维护范围内", model_name)
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        return error_response(404, "BILLING_RATE_NOT_FOUND", "计费模型不存在", model_name)
    if payload.price_per_minute_yuan < 0:
        return error_response(400, "INVALID_BILLING_RATE", "分钟售价和分钟成本不能为负数")
    if payload.points_per_1k_tokens < 0:
        return error_response(400, "INVALID_BILLING_RATE", "1k Tokens 费率不能为负数")
    normalized_unit = payload.billing_unit.strip().lower()
    if normalized_unit not in {"minute", "1k_tokens"}:
        return error_response(400, "INVALID_BILLING_UNIT", "计费单位仅支持 minute 或 1k_tokens", payload.billing_unit)
    expected_unit = "1k_tokens" if normalized_model_name == "qwen-mt-flash" else "minute"
    if normalized_unit != expected_unit:
        return error_response(400, "INVALID_BILLING_UNIT", f"模型 {model_name} 仅支持 {expected_unit} 计费", payload.billing_unit)
    if expected_unit == "minute":
        price_per_minute_yuan = normalize_rate_yuan(payload.price_per_minute_yuan)
    else:
        price_per_minute_yuan = normalize_rate_yuan(0)
    rate.price_per_minute_yuan = price_per_minute_yuan
    rate.price_per_minute_cents_legacy = yuan_to_compat_cents(price_per_minute_yuan)
    rate.points_per_1k_tokens = payload.points_per_1k_tokens if expected_unit == "1k_tokens" else 0
    rate.billing_unit = expected_unit
    rate.is_active = payload.is_active
    rate.updated_by_user_id = current_admin.id
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return AdminBillingRatesResponse(ok=True, rates=[to_rate_item(rate)])


@router.get(
    "/llm-usage",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_llm_usage(
    user_id: str = "",
    model_name: str = "",
    category: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    normalized_date_from = to_shanghai_naive(date_from)
    normalized_date_to = to_shanghai_naive(date_to)

    parsed_user_id: int | None = None
    if user_id and str(user_id).strip():
        try:
            parsed_user_id = int(str(user_id).strip())
        except (ValueError, TypeError):
            pass

    rows, total = list_all_llm_usage(
        db,
        page=page,
        page_size=page_size,
        model_name=model_name or None,
        category=category or None,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
        user_id=parsed_user_id,
    )

    summary = get_llm_usage_summary(
        db,
        date_from=normalized_date_from,
        date_to=normalized_date_to,
        category=category or None,
        user_id=parsed_user_id,
    )

    def _user_email(uid: int) -> str:
        user = db.get(User, uid)
        return str(user.email) if user else ""

    items = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "user_email": _user_email(r.user_id),
            "trace_id": r.trace_id,
            "category": r.category,
            "model_name": r.model_name,
            "prompt_tokens": r.prompt_tokens,
            "completion_tokens": r.completion_tokens,
            "reasoning_tokens": r.reasoning_tokens,
            "total_tokens": r.total_tokens,
            "input_cost_cents": r.input_cost_cents,
            "charge_cents": r.charge_cents,
            "gross_profit_cents": r.gross_profit_cents,
            "enable_thinking": r.enable_thinking,
            "lesson_id": r.lesson_id,
            "created_at": to_shanghai_aware(r.created_at).isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    return {
        "ok": True,
        "page": page,
        "page_size": page_size,
        "total": total,
        "records": items,
        "summary": summary,
    }
