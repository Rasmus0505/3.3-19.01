from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BillingModelRate, RedeemCode, RedeemCodeBatch
from app.repositories.base import Repository

if TYPE_CHECKING:
    pass


class BillingRepository(Repository[BillingModelRate]):
    """Repository for Billing model operations."""

    def __init__(self, session: Session):
        super().__init__(BillingModelRate, session)

    def get_rate(self, model_name: str) -> Optional[BillingModelRate]:
        return self.session.get(BillingModelRate, model_name)

    def get_all_rates(self) -> List[BillingModelRate]:
        return list(self.session.scalars(select(BillingModelRate).order_by(BillingModelRate.model_name.asc())))

    def get_active_rates(self) -> List[BillingModelRate]:
        return list(
            self.session.scalars(
                select(BillingModelRate)
                .where(BillingModelRate.is_active == True)
                .order_by(BillingModelRate.model_name.asc())
            )
        )

    def upsert_rate(self, rate: BillingModelRate) -> BillingModelRate:
        existing = self.get(rate.model_name)
        if existing:
            for key in [
                "price_per_minute_cents_legacy",
                "cost_per_1k_tokens_cents",
                "cost_per_minute_cents_legacy",
                "price_per_minute_yuan",
                "cost_per_minute_yuan",
                "billing_unit",
                "is_active",
                "parallel_enabled",
                "parallel_threshold_seconds",
                "segment_seconds",
                "max_concurrency",
                "updated_by_user_id",
            ]:
                if hasattr(rate, key):
                    setattr(existing, key, getattr(rate, key))
            self.session.add(existing)
            self.session.flush()
            return existing
        else:
            self.session.add(rate)
            self.session.flush()
            return rate

    def get_redeem_batch(self, batch_id: int) -> Optional[RedeemCodeBatch]:
        return self.session.get(RedeemCodeBatch, batch_id)

    def create_redeem_batch(
        self,
        batch_name: str,
        face_value: int,
        count: int,
        expire_at: datetime,
        active_from: Optional[datetime] = None,
        daily_limit_per_user: Optional[int] = None,
        remark: str = "",
        created_by_user_id: Optional[int] = None,
    ) -> RedeemCodeBatch:
        batch = RedeemCodeBatch(
            batch_name=batch_name,
            face_value_amount_cents=face_value,
            generated_count=count,
            active_from=active_from or datetime.now(),
            expire_at=expire_at,
            daily_limit_per_user=daily_limit_per_user,
            status="active",
            remark=remark,
            created_by_user_id=created_by_user_id,
        )
        self.session.add(batch)
        self.session.flush()
        return batch

    def generate_redeem_codes(self, batch_id: int, count: int) -> List[RedeemCode]:
        batch = self.get_redeem_batch(batch_id)
        if not batch:
            return []
        codes: List[RedeemCode] = []
        for _ in range(count):
            code = RedeemCode(
                batch_id=batch_id,
                code_plain="",
                code_hash="",
                masked_code="",
                status="active",
            )
            codes.append(code)
        self.session.add_all(codes)
        self.session.flush()
        return codes

    def get_redeem_code_by_hash(self, code_hash: str) -> Optional[RedeemCode]:
        return self.session.scalar(
            select(RedeemCode).where(RedeemCode.code_hash == code_hash)
        )

    def get_redeem_code_by_id(self, code_id: int) -> Optional[RedeemCode]:
        return self.session.get(RedeemCode, code_id)

    def mark_redeem_code_used(self, code_id: int, user_id: int) -> Optional[RedeemCode]:
        code = self.get_redeem_code_by_id(code_id)
        if code:
            code.status = "redeemed"
            code.redeemed_by_user_id = user_id
            code.redeemed_at = datetime.now()
            self.session.add(code)
            self.session.flush()
        return code

    def update_redeem_code(
        self,
        code_id: int,
        status: Optional[str] = None,
        redeemed_by_user_id: Optional[int] = None,
        redeemed_at: Optional[datetime] = None,
    ) -> Optional[RedeemCode]:
        code = self.get_redeem_code_by_id(code_id)
        if code:
            if status is not None:
                code.status = status
            if redeemed_by_user_id is not None:
                code.redeemed_by_user_id = redeemed_by_user_id
            if redeemed_at is not None:
                code.redeemed_at = redeemed_at
            self.session.add(code)
            self.session.flush()
        return code

    def list_redeem_codes_by_batch(
        self,
        batch_id: int,
        skip: int = 0,
        limit: int = 100,
    ) -> List[RedeemCode]:
        return list(
            self.session.scalars(
                select(RedeemCode)
                .where(RedeemCode.batch_id == batch_id)
                .order_by(RedeemCode.id.asc())
                .offset(skip)
                .limit(limit)
            )
        )

    def count_redeemed_codes_by_batch(self, batch_id: int) -> int:
        return int(
            self.session.scalar(
                select(RedeemCode.id)
                .where(RedeemCode.batch_id == batch_id, RedeemCode.status == "redeemed")
            ) or 0
        )
