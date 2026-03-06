from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine
from app.models import User, WalletAccount
from app.security import verify_password
from app.services.admin_bootstrap import ensure_admin_users


def _build_session_factory(db_path: str):
    engine = create_database_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)
    return engine, factory


def test_admin_bootstrap_creates_missing_admin_user(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "root@qq.com")
    monkeypatch.delenv("ADMIN_BOOTSTRAP_PASSWORD", raising=False)

    engine, factory = _build_session_factory(str(tmp_path / "admin_bootstrap_create.db"))
    session = factory()
    try:
        created_count = ensure_admin_users(session)
        assert created_count == 1

        admin = session.scalar(select(User).where(User.email == "root@qq.com"))
        assert admin is not None
        assert verify_password("123123", admin.password_hash)

        account = session.scalar(select(WalletAccount).where(WalletAccount.user_id == admin.id))
        assert account is not None
    finally:
        session.close()
        engine.dispose()


def test_admin_bootstrap_is_idempotent_and_does_not_override_password(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "root@qq.com")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "123123")

    engine, factory = _build_session_factory(str(tmp_path / "admin_bootstrap_idempotent.db"))
    session = factory()
    try:
        first = ensure_admin_users(session)
        assert first == 1

        admin = session.scalar(select(User).where(User.email == "root@qq.com"))
        assert admin is not None
        original_hash = admin.password_hash
        assert verify_password("123123", original_hash)

        monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "654321")
        second = ensure_admin_users(session)
        assert second == 0

        admin_after = session.scalar(select(User).where(User.email == "root@qq.com"))
        assert admin_after is not None
        assert admin_after.password_hash == original_hash
        assert verify_password("123123", admin_after.password_hash)
        assert not verify_password("654321", admin_after.password_hash)
    finally:
        session.close()
        engine.dispose()


def test_admin_bootstrap_skips_when_admin_emails_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "   ")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "123123")

    engine, factory = _build_session_factory(str(tmp_path / "admin_bootstrap_empty.db"))
    session = factory()
    try:
        created_count = ensure_admin_users(session)
        assert created_count == 0

        total_users = session.scalar(select(func.count()).select_from(User))
        assert total_users == 0
    finally:
        session.close()
        engine.dispose()
