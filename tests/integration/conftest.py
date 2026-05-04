"""Shared fixtures and helpers for integration regression tests."""
from __future__ import annotations

import os
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import User
from app.services.billing_service import (
    ensure_default_billing_rates,
    get_or_create_wallet_account,
)
from app.services.query_cache import clear_query_caches

FASTER_WHISPER_ASR_MODEL = "faster-whisper-medium"
QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"


def _register_and_login(client: TestClient, email: str = "admin@example.com", password: str = "123456") -> str:
    local_part = email.split("@", 1)[0] if "@" in email else email
    username = re.sub(r"[^a-zA-Z0-9._-]+", "-", local_part).strip("-") or "user"
    reg = client.post("/api/auth/register", json={"email": email, "password": password, "username": username})
    assert reg.status_code == 200
    admin_emails = {item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
    session_factory = getattr(client.app.state, "testing_session_factory", None)
    if session_factory is not None and email.lower() in admin_emails:
        session = session_factory()
        try:
            user = session.query(User).filter(User.email == email.lower()).one()
            user.is_admin = True
            session.add(user)
            session.commit()
        finally:
            session.close()
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def _seed_wallet_balance(session_factory, *, email: str, balance_points: int = 10_000) -> None:
    session = session_factory()
    try:
        user = session.query(User).filter(User.email == email.lower()).one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = balance_points
        session.add(account)
        session.commit()
    finally:
        session.close()


def _enable_upload_task_prereqs(monkeypatch, *, duration_ms: int = 1_000):
    from app.services import lesson_command_service as lesson_command_service_module

    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: duration_ms)
    return lesson_command_service_module


def _enable_local_asr_model(monkeypatch):
    from app.api.routers import lessons as lesson_router
    from app.services import lesson_command_service as lesson_command_service_module
    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(lesson_router, "get_supported_local_browser_asr_model_keys", lambda: (FASTER_WHISPER_ASR_MODEL,))
    monkeypatch.setattr(lesson_command_service_module, "_ensure_sufficient_balance_for_model", lambda *args, **kwargs: 0)

    original_get_model_rate = lesson_service_module.get_model_rate

    def fake_get_model_rate(db, model):
        if model == FASTER_WHISPER_ASR_MODEL:
            return SimpleNamespace(points_per_minute=0, price_per_minute_yuan=0, segment_seconds=300, max_concurrency=1)
        return original_get_model_rate(db, model)

    monkeypatch.setattr(lesson_service_module, "get_model_rate", fake_get_model_rate)
    return lesson_router


def _recreate_legacy_subtitle_settings(
    session_factory,
    *,
    include_timeout: bool = False,
    include_batch_chars: bool = False,
) -> None:
    extra_columns: list[str] = []
    insert_columns: list[str] = [
        "id",
        "semantic_split_default_enabled",
        "subtitle_split_enabled",
        "subtitle_split_target_words",
        "subtitle_split_max_words",
        "semantic_split_max_words_threshold",
        "updated_at",
        "updated_by_user_id",
    ]
    insert_values: list[str] = ["1", "0", "1", "18", "28", "24", "CURRENT_TIMESTAMP", "NULL"]

    if include_timeout:
        extra_columns.append("semantic_split_timeout_seconds INTEGER NOT NULL DEFAULT 40")
        insert_columns.insert(6, "semantic_split_timeout_seconds")
        insert_values.insert(6, "40")
    if include_batch_chars:
        extra_columns.append("translation_batch_max_chars INTEGER NOT NULL DEFAULT 2600")
        insert_columns.insert(7 if include_timeout else 6, "translation_batch_max_chars")
        insert_values.insert(7 if include_timeout else 6, "2600")

    session = session_factory()
    try:
        session.execute(text("DROP TABLE subtitle_settings"))
        create_sql = """
            CREATE TABLE subtitle_settings (
                id INTEGER NOT NULL PRIMARY KEY,
                semantic_split_default_enabled BOOLEAN NOT NULL DEFAULT 0,
                subtitle_split_enabled BOOLEAN NOT NULL DEFAULT 1,
                subtitle_split_target_words INTEGER NOT NULL DEFAULT 18,
                subtitle_split_max_words INTEGER NOT NULL DEFAULT 28,
                semantic_split_max_words_threshold INTEGER NOT NULL DEFAULT 24,
        """
        if extra_columns:
            create_sql += "                " + ",\n                ".join(extra_columns) + ",\n"
        create_sql += """
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_by_user_id INTEGER
            )
        """
        session.execute(text(create_sql))
        session.execute(
            text(
                f"""
                INSERT INTO subtitle_settings ({", ".join(insert_columns)})
                VALUES ({", ".join(insert_values)})
                """
            )
        )
        session.commit()
    finally:
        session.close()


@pytest.fixture
def test_client(tmp_path, monkeypatch):
    clear_query_caches()
    db_file = tmp_path / "test_app.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    Base.metadata.create_all(bind=engine)

    seed = TestingSessionLocal()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    app = create_app(enable_lifespan=False)
    app.state.testing_session_factory = TestingSessionLocal

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, TestingSessionLocal, monkeypatch
    clear_query_caches()
