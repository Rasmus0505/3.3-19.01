from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BillingModelRate


def list_billing_rates(db: Session) -> list[BillingModelRate]:
    return list(db.scalars(select(BillingModelRate).order_by(BillingModelRate.model_name.asc())).all())


def get_billing_rate(db: Session, model_name: str) -> BillingModelRate | None:
    return db.get(BillingModelRate, model_name)
