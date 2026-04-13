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
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "Bootstrap-Admin-2026!")

    engine, factory = _build_session_factory(str(tmp_path / "admin_bootstrap_create.db"))
    session = factory()
    try:
        created_count = ensure_admin_users(session)
        assert created_count == 1

        admin = session.scalar(select(User).where(User.email == "root@qq.com"))
        assert admin is not None
        assert admin.is_admin is True
        assert verify_password("Bootstrap-Admin-2026!", admin.password_hash)

        account = session.scalar(select(WalletAccount).where(WalletAccount.user_id == admin.id))
        assert account is not None
    finally:
        session.close()
        engine.dispose()


def test_admin_bootstrap_requires_strong_password_for_missing_admin_user(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "root@qq.com")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "123123")

    engine, factory = _build_session_factory(str(tmp_path / "admin_bootstrap_weak.db"))
    session = factory()
    try:
        try:
            ensure_admin_users(session)
        except RuntimeError as exc:
            assert "strong" in str(exc).lower()
        else:
            raise AssertionError("expected ensure_admin_users to reject a weak bootstrap password")
    finally:
        session.close()
        engine.dispose()


def test_admin_bootstrap_is_idempotent_and_does_not_override_password(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "root@qq.com")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "Bootstrap-Admin-2026!")

    engine, factory = _build_session_factory(str(tmp_path / "admin_bootstrap_idempotent.db"))
    session = factory()
    try:
        first = ensure_admin_users(session)
        assert first == 1

        admin = session.scalar(select(User).where(User.email == "root@qq.com"))
        assert admin is not None
        original_hash = admin.password_hash
        assert admin.is_admin is True
        assert verify_password("Bootstrap-Admin-2026!", original_hash)

        monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "Another-Strong-Admin-2026!")
        second = ensure_admin_users(session)
        assert second == 0

        admin_after = session.scalar(select(User).where(User.email == "root@qq.com"))
        assert admin_after is not None
        assert admin_after.password_hash == original_hash
        assert verify_password("Bootstrap-Admin-2026!", admin_after.password_hash)
        assert not verify_password("Another-Strong-Admin-2026!", admin_after.password_hash)
    finally:
        session.close()
        engine.dispose()


def test_admin_bootstrap_skips_when_admin_emails_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "   ")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "Bootstrap-Admin-2026!")

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
