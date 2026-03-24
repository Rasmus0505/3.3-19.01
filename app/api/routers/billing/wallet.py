from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response, map_billing_error
from app.core.timezone import to_shanghai_aware
from app.db import get_db
from app.models import User
from app.models.billing import WalletLedger
from app.schemas import ErrorResponse, WalletMeResponse, WalletRedeemCodeRequest, WalletRedeemCodeResponse
from app.services.billing_service import BillingError, calculate_points, consume_points, get_model_rate, get_or_create_wallet_account, record_consume, redeem_code


router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("/me", response_model=WalletMeResponse, responses={401: {"model": ErrorResponse}})
def wallet_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = get_or_create_wallet_account(db, current_user.id, for_update=False)
    db.commit()
    db.refresh(account)
    return WalletMeResponse(ok=True, balance_amount_cents=account.balance_amount_cents, updated_at=to_shanghai_aware(account.updated_at))


@router.get("/balance", responses={401: {"model": ErrorResponse}})
def wallet_balance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = get_or_create_wallet_account(db, current_user.id, for_update=False)
    db.commit()
    db.refresh(account)
    return {
        "ok": True,
        "balance": int(account.balance_amount_cents or 0),
        "balance_amount_cents": int(account.balance_amount_cents or 0),
        "currency": "CNY",
        "updated_at": to_shanghai_aware(account.updated_at),
    }


@router.post(
    "/redeem-code",
    response_model=WalletRedeemCodeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def wallet_redeem_code(
    payload: WalletRedeemCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        ledger = redeem_code(db, user_id=current_user.id, raw_code=payload.code)
        db.commit()
        return WalletRedeemCodeResponse(
            ok=True,
            balance_amount_cents=ledger.balance_after_amount_cents,
            redeemed_amount_cents=ledger.delta_amount_cents,
            redeem_code_mask=ledger.redeem_code_mask or "",
        )
    except BillingError as exc:
        db.commit()
        return map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "兑换失败", str(exc)[:1200])


@router.post("/consume", responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}})
def wallet_consume(
    payload: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson_id = int(payload.get("courseId") or payload.get("course_id") or payload.get("lessonId") or payload.get("lesson_id") or 0)
    actual_seconds = max(0, int(payload.get("actualSeconds") or payload.get("actual_seconds") or 0))
    model_name = str(payload.get("modelName") or payload.get("model_name") or "faster-whisper-medium").strip() or "faster-whisper-medium"
    runtime_kind = str(payload.get("runtimeKind") or payload.get("runtime_kind") or "").strip()

    if lesson_id <= 0:
        return error_response(400, "INVALID_LESSON_ID", "缺少有效课程 ID", str(payload.get("courseId") or payload.get("lessonId") or ""))
    if actual_seconds <= 0:
        return error_response(400, "INVALID_USAGE_SECONDS", "缺少有效的实际用量秒数", str(payload.get("actualSeconds") or payload.get("actual_seconds") or ""))

    try:
        account = get_or_create_wallet_account(db, current_user.id, for_update=True)
        existing_consume = db.scalar(
            select(WalletLedger)
            .where(
                WalletLedger.user_id == current_user.id,
                WalletLedger.lesson_id == lesson_id,
                WalletLedger.event_type == "consume",
                WalletLedger.model_name == model_name,
            )
            .order_by(WalletLedger.id.desc())
            .limit(1)
        )
        existing_consume_charge = db.scalar(
            select(WalletLedger)
            .where(
                WalletLedger.user_id == current_user.id,
                WalletLedger.lesson_id == lesson_id,
                WalletLedger.event_type == "consume",
                WalletLedger.model_name == model_name,
                WalletLedger.delta_amount_cents < 0,
            )
            .order_by(WalletLedger.id.desc())
            .limit(1)
        )
        if existing_consume is None:
            rate = get_model_rate(db, model_name)
            consume_amount_cents = calculate_points(
                int(actual_seconds * 1000),
                int(rate.points_per_minute or 0),
                price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
            )
            consume_points(
                db,
                user_id=current_user.id,
                points=int(consume_amount_cents),
                model_name=model_name,
                lesson_id=lesson_id,
                duration_ms=int(actual_seconds * 1000),
                note=f"客户端本地生成上报补记，runtime_kind={runtime_kind or 'unknown'}，actual_seconds={actual_seconds}",
            )
            record_consume(
                db,
                user_id=current_user.id,
                model_name=model_name,
                duration_ms=int(actual_seconds * 1000),
                lesson_id=lesson_id,
                note=f"客户端本地生成用量已上报，runtime_kind={runtime_kind or 'unknown'}，actual_seconds={actual_seconds}",
            )
            db.commit()
            db.refresh(account)
            return {
                "ok": True,
                "already_recorded": False,
                "balance": int(account.balance_amount_cents or 0),
                "balance_amount_cents": int(account.balance_amount_cents or 0),
                "currency": "CNY",
                "consumed_amount_cents": int(consume_amount_cents),
                "lesson_id": lesson_id,
                "model_name": model_name,
            }

        db.commit()
        db.refresh(account)
        return {
            "ok": True,
                "already_recorded": True,
                "balance": int(account.balance_amount_cents or 0),
                "balance_amount_cents": int(account.balance_amount_cents or 0),
                "currency": "CNY",
                "consumed_amount_cents": int(abs((existing_consume_charge or existing_consume).delta_amount_cents or 0)),
                "lesson_id": lesson_id,
                "model_name": model_name,
            }
    except BillingError as exc:
        db.commit()
        return map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "上报本地生成用量失败", str(exc)[:1200])
