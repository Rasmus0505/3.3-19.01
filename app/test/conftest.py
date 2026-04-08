"""pytest 配置文件。

提供后端测试的 fixtures 和配置。
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.models import Base
from app.models.user import User
from app.models.billing import WalletAccount, BillingModelRate


@pytest.fixture
def engine():
    """创建内存 SQLite 引擎用于测试。"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db_session(engine) -> Session:
    """创建数据库会话。"""
    TestSession = sessionmaker(bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_user(db_session: Session) -> User:
    """创建测试用户。"""
    user = User(
        id=1,
        username="testuser",
        email="test@example.com",
        hashed_password="hashed_password_here",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_wallet(db_session: Session, test_user: User) -> WalletAccount:
    """创建测试钱包账户。"""
    wallet = WalletAccount(
        user_id=test_user.id,
        balance_amount_cents=10000,  # 100 元
    )
    db_session.add(wallet)
    db_session.commit()
    return wallet


@pytest.fixture
def test_billing_rates(db_session: Session) -> list[BillingModelRate]:
    """创建测试费率数据。"""
    rates = [
        BillingModelRate(
            model_name="qwen3-asr-flash-filetrans",
            points_per_minute=130,
            price_per_minute_yuan=1.30,
            billing_unit="minute",
            is_active=True,
        ),
        BillingModelRate(
            model_name="qwen-mt-flash",
            points_per_1k_tokens=15,
            billing_unit="1k_tokens",
            is_active=True,
        ),
        BillingModelRate(
            model_name="faster-whisper-medium",
            points_per_minute=130,
            price_per_minute_yuan=1.30,
            billing_unit="minute",
            is_active=True,
        ),
    ]
    for rate in rates:
        db_session.add(rate)
    db_session.commit()
    return rates
