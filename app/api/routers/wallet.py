from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse, WalletMeResponse
from app.services.billing_service import get_or_create_wallet_account


router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("/me", response_model=WalletMeResponse, responses={401: {"model": ErrorResponse}})
def wallet_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = get_or_create_wallet_account(db, current_user.id, for_update=False)
    db.commit()
    db.refresh(account)
    return WalletMeResponse(ok=True, balance_points=account.balance_points, updated_at=account.updated_at)
