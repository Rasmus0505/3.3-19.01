from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response, map_billing_error
from app.core.timezone import to_shanghai_aware
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse, WalletMeResponse, WalletRedeemCodeRequest, WalletRedeemCodeResponse
from app.services.billing_service import BillingError, get_or_create_wallet_account, redeem_code


router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("/me", response_model=WalletMeResponse, responses={401: {"model": ErrorResponse}})
def wallet_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = get_or_create_wallet_account(db, current_user.id, for_update=False)
    db.commit()
    db.refresh(account)
    return WalletMeResponse(ok=True, balance_points=account.balance_points, updated_at=to_shanghai_aware(account.updated_at))


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
            balance_points=ledger.balance_after,
            redeemed_points=ledger.delta_points,
            redeem_code_mask=ledger.redeem_code_mask or "",
        )
    except BillingError as exc:
        # redeem_code 会在失败路径写入审计记录，这里保留并提交失败日志
        db.commit()
        return map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "兑换失败", str(exc)[:1200])
