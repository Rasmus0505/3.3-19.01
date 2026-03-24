"""pytest fixtures: 计费相关。"""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.billing import BillingModelRate, RedeemCodeBatch, RedeemCode, RedeemCodeAttempt, WalletAccount
from tests.fixtures.auth import admin_user, test_user


@pytest.fixture(scope="function")
def test_wallet(db_session: Session, test_user) -> WalletAccount:
    """创建测试钱包账户。"""
    wallet = WalletAccount(
        user_id=test_user.id,
        balance_amount_cents=10000,  # 100.00 元
        frozen_amount_cents=0,
        lifetime_earned_cents=10000,
    )
    db_session.add(wallet)
    db_session.flush()
    return wallet


@pytest.fixture(scope="function")
def test_billing_rate(db_session: Session, admin_user) -> BillingModelRate:
    """创建测试计费费率。"""
    rate = BillingModelRate(
        model_name="faster-whisper",
        rate_per_second_yuan=Decimal("0.001"),
        is_active=True,
        created_by=admin_user.id,
    )
    db_session.add(rate)
    db_session.flush()
    return rate


@pytest.fixture(scope="function")
def test_redeem_batch(db_session: Session, admin_user) -> RedeemCodeBatch:
    """创建测试兑换码批次。"""
    batch = RedeemCodeBatch(
        created_by=admin_user.id,
        total=10,
        denomination_yuan=Decimal("10.00"),
        valid_days=30,
        daily_limit=5,
        status="active",
    )
    db_session.add(batch)
    db_session.flush()
    return batch


@pytest.fixture(scope="function")
def test_redeem_code(db_session: Session, test_redeem_batch: RedeemCodeBatch) -> RedeemCode:
    """创建单个测试兑换码。"""
    code = RedeemCode(
        batch_id=test_redeem_batch.id,
        code="TEST-AABB-CCDD",
        status="active",
        created_by=test_redeem_batch.created_by,
        denomination_yuan=Decimal("10.00"),
        valid_days=30,
        daily_limit=5,
    )
    db_session.add(code)
    db_session.flush()
    return code
