from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import WalletAccount
from app.services.billing import get_or_create_wallet_account


def get_wallet_for_user(db: Session, user_id: int, *, for_update: bool = False) -> WalletAccount:
    return get_or_create_wallet_account(db, user_id, for_update=for_update)
