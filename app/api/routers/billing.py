from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.serializers import to_rate_item
from app.db import get_db
from app.schemas import BillingRatesResponse
from app.services.billing_service import list_public_rates


router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/rates", response_model=BillingRatesResponse)
def public_billing_rates(db: Session = Depends(get_db)):
    rates = list_public_rates(db)
    return BillingRatesResponse(ok=True, rates=[to_rate_item(item) for item in rates])
