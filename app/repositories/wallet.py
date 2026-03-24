from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WalletAccount, WalletLedger
from app.repositories.base import Repository

if TYPE_CHECKING:
    pass


class WalletRepository(Repository[WalletAccount]):
    """Repository for Wallet model operations."""

    def __init__(self, session: Session):
        super().__init__(WalletAccount, session)

    def get_account(self, user_id: int) -> Optional[WalletAccount]:
        return self.session.get(WalletAccount, user_id)

    def get_or_create_account(self, user_id: int) -> WalletAccount:
        account = self.get_account(user_id)
        if account:
            return account
        account = WalletAccount(user_id=user_id, balance_amount_cents=0)
        self.session.add(account)
        self.session.flush()
        return account

    def get_ledger(self, user_id: int, skip: int = 0, limit: int = 50) -> List[WalletLedger]:
        return list(
            self.session.scalars(
                select(WalletLedger)
                .where(WalletLedger.user_id == user_id)
                .order_by(WalletLedger.created_at.desc(), WalletLedger.id.desc())
                .offset(skip)
                .limit(limit)
            )
        )

    def add_points(
        self,
        user_id: int,
        delta: int,
        event_type: str,
        **kwargs,
    ) -> WalletAccount:
        account = self.get_or_create_account(user_id)
        account.balance_points += delta
        self.session.add(account)
        self.session.flush()

        ledger_kwargs = {
            "user_id": user_id,
            "event_type": event_type,
            "delta_points": delta,
            "balance_after": account.balance_points,
        }
        for key in [
            "operator_user_id",
            "model_name",
            "duration_ms",
            "lesson_id",
            "redeem_batch_id",
            "redeem_code_id",
            "redeem_code_mask",
            "note",
        ]:
            if key in kwargs:
                ledger_kwargs[key] = kwargs[key]

        ledger = WalletLedger(**ledger_kwargs)
        self.session.add(ledger)
        self.session.flush()
        return account

    def subtract_points(
        self,
        user_id: int,
        delta: int,
        event_type: str,
        **kwargs,
    ) -> WalletAccount:
        account = self.get_or_create_account(user_id)
        account.balance_points -= delta
        self.session.add(account)
        self.session.flush()

        ledger_kwargs = {
            "user_id": user_id,
            "event_type": event_type,
            "delta_points": -delta,
            "balance_after": account.balance_points,
        }
        for key in [
            "operator_user_id",
            "model_name",
            "duration_ms",
            "lesson_id",
            "note",
        ]:
            if key in kwargs:
                ledger_kwargs[key] = kwargs[key]

        ledger = WalletLedger(**ledger_kwargs)
        self.session.add(ledger)
        self.session.flush()
        return account
