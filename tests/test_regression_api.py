from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps.auth import get_admin_user
from app.api.routers import local_asr_assets as local_asr_assets_router
from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import BillingModelRate, Lesson, LessonGenerationTask, LessonProgress, LessonSentence, MediaAsset, SubtitleSetting, TranslationRequestLog, User, WalletLedger
from app.services.billing_service import ensure_default_billing_rates, get_or_create_wallet_account, get_subtitle_settings, settle_reserved_points
from app.services.lesson_service import LessonService
from app.services.lesson_builder import normalize_learning_english_text, tokenize_learning_sentence
from app.services.query_cache import clear_query_caches
from app.services.sensevoice import SENSEVOICE_ASR_MODEL, get_sensevoice_settings

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"


def _frontend_build_marker_from_index() -> str:
    html = (Path(__file__).resolve().parents[1] / "app" / "static" / "index.html").read_text(encoding="utf-8")
    match = re.search(r'/static/assets/([^"\']+)', html)
    assert match
    return str(match.group(1))


def _word_entry(text: str, begin_ms: int, end_ms: int, *, punctuation: str = "", surface: str | None = None) -> dict[str, object]:
    return {
        "text": text,
        "surface": surface or (f"{text}{punctuation}" if punctuation else text),
        "punctuation": punctuation,
        "begin_time": begin_ms,
        "end_time": end_ms,
    }


def _translation_batch_result(texts: list[str], *, failed_count: int = 0, total_tokens: int = 0, latest_error_summary: str = ""):
    success_count = max(0, len(texts) - failed_count)
    return SimpleNamespace(
        texts=list(texts),
        failed_count=failed_count,
        attempt_records=[],
        total_requests=len(texts),
        success_request_count=success_count,
        success_prompt_tokens=0,
        success_completion_tokens=0,
        success_total_tokens=total_tokens,
        latest_error_summary=latest_error_summary,
    )


def _parse_sse_events(raw_text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in raw_text.replace("\r\n", "\n").split("\n\n"):
        chunk = block.strip()
        if not chunk:
            continue
        event_name = "message"
        data_lines: list[str] = []
        for line in chunk.split("\n"):
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip() or "message"
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        if not data_lines:
            continue
        events.append((event_name, json.loads("\n".join(data_lines))))
    return events


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


def test_lesson_catalog_returns_paginated_items_search_and_cache(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="lesson-catalog-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == "lesson-catalog-user@example.com"))
        assert user is not None

        lesson_alpha = Lesson(
            user_id=user.id,
            title="Alpha Lesson",
            source_filename="alpha.mp3",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=3100,
            source_duration_ms=3100,
            status="ready",
            created_at=datetime(2026, 3, 9, 9, 0, 0),
        )
        lesson_beta = Lesson(
            user_id=user.id,
            title="Beta Lesson",
            source_filename="beta.mp3",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=4200,
            source_duration_ms=4200,
            status="ready",
            created_at=datetime(2026, 3, 10, 9, 0, 0),
        )
        lesson_gamma = Lesson(
            user_id=user.id,
            title="Gamma Lesson",
            source_filename="gamma.mp3",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=5300,
            source_duration_ms=5300,
            status="ready",
            created_at=datetime(2026, 3, 11, 9, 0, 0),
        )
        session.add_all([lesson_alpha, lesson_beta, lesson_gamma])
        session.flush()

        session.add_all(
            [
                LessonSentence(lesson_id=lesson_alpha.id, idx=0, begin_ms=0, end_ms=1000, text_en="alpha one", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_alpha.id, idx=1, begin_ms=1000, end_ms=2000, text_en="alpha two", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_beta.id, idx=0, begin_ms=0, end_ms=1000, text_en="beta one", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_gamma.id, idx=0, begin_ms=0, end_ms=1000, text_en="gamma one", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_gamma.id, idx=1, begin_ms=1000, end_ms=2000, text_en="gamma two", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_gamma.id, idx=2, begin_ms=2000, end_ms=3000, text_en="gamma three", text_zh="", tokens_json=[]),
            ]
        )
        session.add(
            LessonProgress(
                lesson_id=lesson_gamma.id,
                user_id=user.id,
                current_sentence_idx=1,
                completed_indexes_json=[0],
                last_played_at_ms=1800,
            )
        )
        session.commit()
    finally:
        session.close()

    import app.services.lesson_query_service as lesson_query_service

    call_count = 0
    original = lesson_query_service.list_lesson_catalog_for_user

    def counted(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(lesson_query_service, "list_lesson_catalog_for_user", counted)

    first = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 2})
    assert first.status_code == 200
    first_data = first.json()
    assert first_data["ok"] is True
    assert first_data["total"] == 3
    assert first_data["has_more"] is True
    assert len(first_data["items"]) == 2
    assert first_data["items"][0]["title"] == "Gamma Lesson"
    assert first_data["items"][0]["sentence_count"] == 3
    assert first_data["items"][0]["progress_summary"]["current_sentence_index"] == 1
    assert first_data["items"][0]["progress_summary"]["completed_sentence_count"] == 1

    second = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 2})
    assert second.status_code == 200
    assert call_count == 1

    search = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 20, "q": "beta"})
    assert search.status_code == 200
    search_data = search.json()
    assert search_data["total"] == 1
    assert search_data["items"][0]["title"] == "Beta Lesson"
    assert call_count == 2

    rename = client.patch(
        f"/api/lessons/{first_data['items'][0]['id']}",
        headers=headers,
        json={"title": "Gamma Lesson Renamed"},
    )
    assert rename.status_code == 200

    third = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 2})
    assert third.status_code == 200
    assert call_count == 3
    assert third.json()["items"][0]["title"] == "Gamma Lesson Renamed"


def test_normalize_learning_english_text_spells_usd_amounts():
    assert normalize_learning_english_text("$40?") == "forty dollars?"
    assert normalize_learning_english_text("It is $1.") == "It is one dollar."
    assert normalize_learning_english_text("$0.50") == "fifty cents"
    assert normalize_learning_english_text("We spent $40.50 today.") == "We spent forty dollars and fifty cents today."
    assert normalize_learning_english_text("Room 40") == "Room 40"
    assert normalize_learning_english_text("$FOO") == "$FOO"
    assert tokenize_learning_sentence("$40?") == ["forty", "dollars"]


@pytest.fixture()
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


def test_ensure_default_billing_rates_rebuilds_legacy_sqlite_constraint(tmp_path):
    db_file = tmp_path / "legacy_billing.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)
    User.__table__.create(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE billing_model_rates (
                    model_name VARCHAR(100) NOT NULL PRIMARY KEY,
                    points_per_minute INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INTEGER,
                    CONSTRAINT ck_billing_rate_positive CHECK (points_per_minute > 0)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen3-asr-flash-filetrans', 130, 1, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen-mt-custom', 1, 1, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE wallet_ledger (
                    id INTEGER NOT NULL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    operator_user_id INTEGER,
                    event_type VARCHAR(32) NOT NULL,
                    delta_points BIGINT NOT NULL,
                    balance_after BIGINT NOT NULL,
                    model_name VARCHAR(100),
                    duration_ms INTEGER,
                    lesson_id INTEGER,
                    note TEXT NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT ck_wallet_ledger_event_type CHECK (event_type IN ('reserve','consume','refund','manual_adjust'))
                )
                """
            )
        )

    seed = TestingSessionLocal()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    with engine.connect() as conn:
        ddl = str(
            conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='billing_model_rates'")
            ).scalar()
            or ""
        ).lower()
        wallet_ddl = str(
            conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_ledger'")
            ).scalar()
            or ""
        ).lower()
        mt_rate = conn.execute(
            text(
                """
                SELECT model_name, points_per_minute, points_per_1k_tokens, billing_unit
                FROM billing_model_rates
                WHERE model_name = 'qwen-mt-flash'
                """
            )
        ).mappings().one()
        non_flash_mt_count = int(
            conn.execute(
                text(
                    """
                    SELECT COUNT(1)
                    FROM billing_model_rates
                    WHERE model_name LIKE 'qwen-mt-%'
                      AND model_name <> 'qwen-mt-flash'
                    """
                )
            ).scalar()
            or 0
        )

    assert "points_per_minute > 0" not in ddl
    assert "points_per_minute >= 0" in ddl
    assert "ck_billing_rate_token_non_negative" in ddl
    assert "consume_translate" in wallet_ddl
    assert "refund_translate" in wallet_ddl
    assert mt_rate["model_name"] == "qwen-mt-flash"
    assert mt_rate["points_per_minute"] == 0
    assert mt_rate["points_per_1k_tokens"] > 0
    assert mt_rate["billing_unit"] == "1k_tokens"
    assert non_flash_mt_count == 0


def test_subtitle_settings_migration_idempotent_when_table_exists(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "subtitle_migration.db"
    database_url = f"sqlite:///{db_file.as_posix()}"

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url

    def _upgrade(target: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", target],
            cwd=str(repo_root),
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"alembic upgrade {target} failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

    _upgrade("20260306_0006")

    engine = create_database_engine(database_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE subtitle_settings (
                        id INTEGER NOT NULL PRIMARY KEY,
                        semantic_split_default_enabled BOOLEAN NOT NULL DEFAULT 0,
                        subtitle_split_enabled BOOLEAN NOT NULL DEFAULT 1,
                        subtitle_split_target_words INTEGER NOT NULL DEFAULT 18,
                        subtitle_split_max_words INTEGER NOT NULL DEFAULT 28,
                        semantic_split_max_words_threshold INTEGER NOT NULL DEFAULT 24,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_by_user_id INTEGER
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO subtitle_settings (
                        id,
                        semantic_split_default_enabled,
                        subtitle_split_enabled,
                        subtitle_split_target_words,
                        subtitle_split_max_words,
                        semantic_split_max_words_threshold,
                        updated_at,
                        updated_by_user_id
                    )
                    VALUES (1, 0, 1, 18, 28, 24, CURRENT_TIMESTAMP, NULL)
                    """
                )
            )
    finally:
        engine.dispose()

    _upgrade("head")
    _upgrade("head")

    verify_engine = create_database_engine(database_url)
    try:
        with verify_engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            subtitle_row = conn.execute(
                text(
                    """
                    SELECT id, subtitle_split_enabled, semantic_split_timeout_seconds, translation_batch_max_chars
                    FROM subtitle_settings
                    WHERE id = 1
                    """
                )
            ).mappings().one_or_none()
            subtitle_columns = {
                str(row["name"])
                for row in conn.execute(text("PRAGMA table_info(subtitle_settings)")).mappings().all()
            }
            mt_models = conn.execute(
                text(
                    """
                    SELECT model_name
                    FROM billing_model_rates
                    WHERE model_name LIKE 'qwen-mt-%'
                    ORDER BY model_name
                    """
                )
            ).scalars().all()
    finally:
        verify_engine.dispose()

    assert version == "20260310_0014"
    assert subtitle_row is not None
    assert int(subtitle_row["id"]) == 1
    assert bool(subtitle_row["subtitle_split_enabled"]) is True
    assert int(subtitle_row["semantic_split_timeout_seconds"]) == 40
    assert int(subtitle_row["translation_batch_max_chars"]) == 2600
    assert "semantic_split_timeout_seconds" in subtitle_columns
    assert "translation_batch_max_chars" in subtitle_columns
    assert "semantic_split_model" not in subtitle_columns
    assert mt_models == ["qwen-mt-flash"]


def test_lesson_generation_tasks_repair_migration_recreates_missing_table(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "lesson_task_repair.db"
    database_url = f"sqlite:///{db_file.as_posix()}"

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url

    def _upgrade(target: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", target],
            cwd=str(repo_root),
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"alembic upgrade {target} failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

    _upgrade("20260310_0013")

    mutate_engine = create_database_engine(database_url)
    try:
        with mutate_engine.begin() as conn:
            conn.execute(text("DROP TABLE lesson_generation_tasks"))
    finally:
        mutate_engine.dispose()

    _upgrade("head")

    verify_engine = create_database_engine(database_url)
    try:
        with verify_engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            table_count = int(
                conn.execute(
                    text(
                        """
                        SELECT COUNT(1)
                        FROM sqlite_master
                        WHERE type = 'table' AND name = 'lesson_generation_tasks'
                        """
                    )
                ).scalar()
                or 0
            )
            column_names = {
                str(item["name"])
                for item in conn.execute(text("PRAGMA table_info(lesson_generation_tasks)")).mappings().all()
            }
            index_names = {
                str(item["name"])
                for item in conn.execute(text("PRAGMA index_list(lesson_generation_tasks)")).mappings().all()
            }
            translation_log_columns = {
                str(item["name"])
                for item in conn.execute(text("PRAGMA table_info(translation_request_logs)")).mappings().all()
            }
    finally:
        verify_engine.dispose()

    assert version == "20260314_0018"
    assert table_count == 1
    assert {"task_id", "owner_user_id", "failure_debug_json", "failed_at", "asr_raw_json", "raw_debug_purged_at"}.issubset(column_names)
    assert {"raw_request_text", "raw_response_text", "raw_error_text"}.issubset(translation_log_columns)
    assert {
        "ix_lesson_generation_tasks_task_id",
        "ix_lesson_generation_tasks_owner_user_id",
        "ix_lesson_generation_tasks_lesson_id",
    }.issubset(index_names)


def _register_and_login(client: TestClient, email: str = "admin@example.com", password: str = "123456") -> str:
    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["access_token"]


def test_health_endpoint(test_client):
    client, _, _ = test_client
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["service"]


def test_health_ready_endpoint(test_client, monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "_probe_database_ready", lambda: (True, ""))
    client, _, _ = test_client
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["status"]["db_ready"] is True


def test_probe_database_ready_does_not_open_session_for_schema_checks(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name == "billing_model_rates"

        def get_columns(self, table_name, schema=None):
            if table_name != "billing_model_rates":
                return []
            required = app_main.READINESS_REQUIRED_COLUMNS["billing_model_rates"]
            return [{"name": name} for name in required]

    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _connection: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates",))
    monkeypatch.setattr(
        app_main,
        "SessionLocal",
        lambda: (_ for _ in ()).throw(AssertionError("SessionLocal should not be used during readiness schema checks")),
    )

    ready, error = app_main._probe_database_ready()

    assert ready is True
    assert error == ""


def test_lesson_task_resume_reuses_failed_task_artifacts(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="resume-task@example.com")

    from app.api.routers import lessons as lessons_router

    import threading as py_threading

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    attempts = {"count": 0}

    def fake_generate_from_saved_file(*, source_path, source_filename, req_dir, owner_id, asr_model, db, progress_callback=None, task_id=None, semantic_split_enabled=None):
        attempts["count"] += 1
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        if attempts["count"] == 1:
            (req_dir / "lesson_input.opus").write_bytes(b"opus")
            (req_dir / "asr_result.json").write_text(json.dumps({"asr_payload": {"transcripts": []}, "usage_seconds": 1, "progress_counters": {"asr_done": 2, "asr_estimated": 2, "segment_done": 2, "segment_total": 2}}, ensure_ascii=False), encoding="utf-8")
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "running",
                    "overall_percent": 72,
                    "current_text": "翻译字幕 1/2",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
                }
            )
            raise RuntimeError("translate failed")

        lesson = Lesson(
            user_id=owner_id,
            title=Path(source_filename).stem,
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(LessonSentence(lesson_id=lesson.id, idx=0, begin_ms=0, end_ms=1000, text_en="hello", text_zh="你好", tokens_json=["hello"], audio_clip_path=None))
        db.add(LessonProgress(lesson_id=lesson.id, user_id=owner_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0))
        db.commit()
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": 1,
            "strategy_version": 2,
            "asr_payload": {"transcripts": []},
            "sentences": [{"idx": 0, "begin_ms": 0, "end_ms": 1000, "text_en": "hello", "text_zh": "你好", "tokens": ["hello"], "audio_url": None}],
        }
        return lesson

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_saved_file", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        files={"video_file": ("resume.mp4", io.BytesIO(b"video"), "video/mp4")},
        data={"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "false"},
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert failed_task.status_code == 200
    failed_payload = failed_task.json()
    assert failed_payload["status"] == "failed"
    assert failed_payload["resume_available"] is True
    assert failed_payload["resume_stage"] == "translate_zh"
    assert failed_payload["artifact_expires_at"]
    assert failed_payload["failure_debug"]["failed_stage"] == "translate_zh"
    assert failed_payload["failure_debug"]["exception_type"] == "RuntimeError"
    assert "translate failed" in failed_payload["failure_debug"]["detail_excerpt"]
    assert "RuntimeError: translate failed" in failed_payload["failure_debug"]["traceback_excerpt"]
    assert failed_payload["failure_debug"]["last_progress_text"] == "翻译字幕 1/2"

    resume_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})
    assert resume_resp.status_code == 200
    assert resume_resp.json()["ok"] is True

    succeeded_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert succeeded_task.status_code == 200
    success_payload = succeeded_task.json()
    assert success_payload["status"] == "succeeded"
    assert success_payload["resume_available"] is False
    assert success_payload["lesson"]["title"] == "resume"
    assert attempts["count"] == 2


def test_lesson_task_resume_marks_missing_artifacts_as_non_resumable(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="resume-missing@example.com")

    from app.api.routers import lessons as lessons_router

    import threading as py_threading

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    def fake_generate_from_saved_file(*, req_dir, progress_callback=None, **kwargs):
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        (req_dir / "lesson_input.opus").write_bytes(b"opus")
        (req_dir / "asr_result.json").write_text(json.dumps({"asr_payload": {"transcripts": []}}, ensure_ascii=False), encoding="utf-8")
        progress_callback(
            {
                "stage_key": "translate_zh",
                "stage_status": "running",
                "overall_percent": 72,
                "current_text": "翻译字幕 1/2",
                "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
            }
        )
        raise RuntimeError("temporary failure")

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_saved_file", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        files={"video_file": ("resume-missing.mp4", io.BytesIO(b"video"), "video/mp4")},
        data={"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "false"},
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    session = session_factory()
    try:
        task = session.query(LessonGenerationTask).filter(LessonGenerationTask.task_id == task_id).one()
        Path(task.source_path).unlink()
    finally:
        session.close()

    resume_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})
    assert resume_resp.status_code == 400
    assert resume_resp.json()["error_code"] == "TASK_ARTIFACT_MISSING"

    failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert failed_task.status_code == 200
    failed_payload = failed_task.json()
    assert failed_payload["resume_available"] is False
    assert failed_payload["failure_debug"]["exception_type"] == "FileNotFoundError"
    assert "resume artifacts missing" in failed_payload["failure_debug"]["detail_excerpt"]


def test_lesson_task_resume_restarts_failed_task_when_resume_unavailable(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="restart-task@example.com")

    from app.api.routers import lessons as lessons_router

    import threading as py_threading

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    attempts = {"count": 0}

    def fake_generate_from_saved_file(*, source_filename, req_dir, owner_id, asr_model, db, progress_callback=None, **kwargs):
        attempts["count"] += 1
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        if attempts["count"] == 1:
            (req_dir / "lesson_input.opus").write_bytes(b"opus")
            (req_dir / "asr_result.json").write_text(
                json.dumps(
                    {"asr_payload": {"transcripts": []}, "usage_seconds": 1, "progress_counters": {"asr_done": 2, "asr_estimated": 2, "segment_done": 2, "segment_total": 2}},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "running",
                    "overall_percent": 72,
                    "current_text": "翻译字幕 1/2",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
                }
            )
            raise RuntimeError("restart failure")

        lesson = Lesson(
            user_id=owner_id,
            title=Path(source_filename).stem,
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(LessonSentence(lesson_id=lesson.id, idx=0, begin_ms=0, end_ms=1000, text_en="hello", text_zh="你好", tokens_json=["hello"], audio_clip_path=None))
        db.add(LessonProgress(lesson_id=lesson.id, user_id=owner_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0))
        db.commit()
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": 1,
            "strategy_version": 2,
            "asr_payload": {"transcripts": []},
            "sentences": [{"idx": 0, "begin_ms": 0, "end_ms": 1000, "text_en": "hello", "text_zh": "你好", "tokens": ["hello"], "audio_url": None}],
        }
        return lesson

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_saved_file", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        files={"video_file": ("restart.mp4", io.BytesIO(b"video"), "video/mp4")},
        data={"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "false"},
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    first_failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert first_failed_task.status_code == 200
    first_failed_payload = first_failed_task.json()
    assert first_failed_payload["status"] == "failed"
    assert first_failed_payload["resume_available"] is True

    session = session_factory()
    try:
        task = session.query(LessonGenerationTask).filter(LessonGenerationTask.task_id == task_id).one()
        task.resume_available = False
        task.resume_stage = ""
        session.commit()
    finally:
        session.close()

    restart_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})
    assert restart_resp.status_code == 200
    assert restart_resp.json()["ok"] is True

    succeeded_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert succeeded_task.status_code == 200
    success_payload = succeeded_task.json()
    assert success_payload["status"] == "succeeded"
    assert success_payload["lesson"]["title"] == "restart"
    assert attempts["count"] == 2


def test_startup_without_dashscope_key_keeps_health_alive(monkeypatch, tmp_path):
    from app import main as app_main

    tmp_base = tmp_path / "startup"
    prefetch_called = {"count": 0}
    monkeypatch.setattr(app_main, "BASE_TMP_DIR", tmp_base)
    monkeypatch.setattr(app_main, "BASE_DATA_DIR", tmp_base / "data")
    monkeypatch.setattr(app_main, "DASHSCOPE_API_KEY", "")
    monkeypatch.setattr(app_main, "_refresh_optional_runtime_status", lambda _app: None)
    monkeypatch.setattr(
        app_main.local_asr_assets,
        "schedule_local_asr_asset_prefetch",
        lambda: prefetch_called.__setitem__("count", prefetch_called["count"] + 1) or True,
    )

    async def fake_bootstrap(app):
        runtime_status = app_main._ensure_runtime_status(app)
        runtime_status.db_ready = True
        runtime_status.checked_at = "2026-03-06T00:00:00+00:00"

    monkeypatch.setattr(app_main, "_bootstrap_runtime_state", fake_bootstrap)

    app = app_main.create_app(enable_lifespan=True)
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["ready"] is True
    assert prefetch_called["count"] == 1


def test_health_ready_returns_503_when_database_unavailable(monkeypatch):
    from app import main as app_main

    monkeypatch.setattr(app_main, "_probe_database_ready", lambda: (False, "db offline"))

    app = app_main.create_app(enable_lifespan=False)
    with TestClient(app) as client:
        health = client.get("/health")
        ready = client.get("/health/ready")

    assert health.status_code == 200
    assert health.json()["ok"] is True
    assert ready.status_code == 503
    payload = ready.json()
    assert payload["ok"] is False
    assert payload["status"]["db_ready"] is False


def test_admin_billing_rates_endpoint_handles_legacy_schema_defaults(tmp_path):
    db_file = tmp_path / "legacy_admin_rates.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE billing_model_rates (
                    model_name VARCHAR(100) NOT NULL PRIMARY KEY,
                    points_per_minute INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INTEGER
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO billing_model_rates (model_name, points_per_minute, is_active, updated_at)
                VALUES ('qwen3-asr-flash-filetrans', 130, 1, CURRENT_TIMESTAMP)
                """
            )
        )

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_admin_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")

    with TestClient(app) as client:
        resp = client.get("/api/admin/billing-rates")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["rates"][0]["price_per_minute_cents"] == 130
    assert payload["rates"][0]["cost_per_minute_cents"] == 0
    assert payload["rates"][0]["billing_unit"] == "minute"
    assert payload["rates"][0]["parallel_enabled"] is False


def test_admin_translation_logs_endpoint_returns_empty_when_table_missing(tmp_path):
    db_file = tmp_path / "legacy_translation_logs.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    User.__table__.create(bind=engine, checkfirst=True)

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_admin_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")

    with TestClient(app) as client:
        resp = client.get("/api/admin/translation-logs")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["total"] == 0
    assert payload["items"] == []


def test_admin_translation_logs_accepts_empty_lesson_id_and_rejects_invalid(test_client, monkeypatch):
    client, _, _ = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "translation-lesson-id-admin@example.com")
    token = _register_and_login(client, email="translation-lesson-id-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    empty_resp = client.get("/api/admin/translation-logs", headers=headers, params={"lesson_id": ""})
    assert empty_resp.status_code == 200
    assert empty_resp.json()["ok"] is True

    invalid_resp = client.get("/api/admin/translation-logs", headers=headers, params={"lesson_id": "abc"})
    assert invalid_resp.status_code == 400
    assert invalid_resp.json()["error_code"] == "INVALID_LESSON_ID"


def test_spa_shell_pages_disable_html_cache_and_expose_build_marker(test_client):
    client, _, _ = test_client
    build_marker = _frontend_build_marker_from_index()

    for path in ("/", "/admin", "/admin/users"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert "no-store" in resp.headers["cache-control"].lower()
        assert resp.headers["pragma"] == "no-cache"
        assert resp.headers["expires"] == "0"
        assert resp.headers["x-frontend-build"] == build_marker


def test_static_assets_keep_cache_behavior_unmodified(test_client):
    client, _, _ = test_client
    build_marker = _frontend_build_marker_from_index()

    resp = client.get(f"/static/assets/{build_marker}")
    assert resp.status_code == 200
    assert "no-store" not in resp.headers.get("cache-control", "").lower()
    assert "x-frontend-build" not in resp.headers


def test_favicon_request_no_longer_returns_404(test_client):
    client, _, _ = test_client
    resp = client.get("/favicon.ico")
    assert resp.status_code in {200, 204}


def test_probe_database_ready_reports_missing_critical_columns(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name == "billing_model_rates"

        def get_columns(self, table_name, schema=None):
            if table_name != "billing_model_rates":
                return []
            return [
                {"name": "model_name"},
                {"name": "points_per_minute"},
                {"name": "points_per_1k_tokens"},
                {"name": "is_active"},
                {"name": "updated_at"},
                {"name": "updated_by_user_id"},
            ]

    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates",))

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error.startswith("missing critical columns:")
    assert "billing_model_rates.billing_unit" in error


def test_probe_database_ready_reports_missing_subtitle_settings_table(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name == "billing_model_rates"

        def get_columns(self, table_name, schema=None):
            if table_name != "billing_model_rates":
                return []
            return [
                {"name": "model_name"},
                {"name": "points_per_minute"},
                {"name": "points_per_1k_tokens"},
                {"name": "billing_unit"},
                {"name": "is_active"},
                {"name": "parallel_enabled"},
                {"name": "parallel_threshold_seconds"},
                {"name": "segment_seconds"},
                {"name": "max_concurrency"},
                {"name": "updated_at"},
                {"name": "updated_by_user_id"},
            ]

    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(app_main, "BUSINESS_TABLES", ("billing_model_rates", "subtitle_settings"))

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error == "missing business tables: subtitle_settings"


def test_probe_database_ready_reports_missing_learning_stats_table(monkeypatch):
    from app import main as app_main

    class DummyConnection:
        def execute(self, _sql):
            return None

    class DummyEngineConnection:
        def __enter__(self):
            return DummyConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyEngine:
        def connect(self):
            return DummyEngineConnection()

    class DummyInspector:
        def has_table(self, table_name, schema=None):
            return table_name in {"billing_model_rates", "subtitle_settings"}

        def get_columns(self, table_name, schema=None):
            if table_name == "billing_model_rates":
                return [
                    {"name": "model_name"},
                    {"name": "points_per_minute"},
                    {"name": "points_per_1k_tokens"},
                    {"name": "billing_unit"},
                    {"name": "is_active"},
                    {"name": "parallel_enabled"},
                    {"name": "parallel_threshold_seconds"},
                    {"name": "segment_seconds"},
                    {"name": "max_concurrency"},
                    {"name": "updated_at"},
                    {"name": "updated_by_user_id"},
                ]
            if table_name == "subtitle_settings":
                return [
                    {"name": "id"},
                    {"name": "semantic_split_default_enabled"},
                    {"name": "default_asr_model"},
                    {"name": "subtitle_split_enabled"},
                    {"name": "subtitle_split_target_words"},
                    {"name": "subtitle_split_max_words"},
                    {"name": "semantic_split_max_words_threshold"},
                    {"name": "semantic_split_timeout_seconds"},
                    {"name": "translation_batch_max_chars"},
                    {"name": "updated_at"},
                    {"name": "updated_by_user_id"},
                ]
            return []

    monkeypatch.setattr(app_main, "schema_name_for_url", lambda _url: "app")
    monkeypatch.setattr(app_main, "engine", DummyEngine())
    monkeypatch.setattr(app_main, "inspect", lambda _conn: DummyInspector())
    monkeypatch.setattr(
        app_main,
        "BUSINESS_TABLES",
        ("billing_model_rates", "subtitle_settings", "user_learning_daily_stats"),
    )

    ready, error = app_main._probe_database_ready()
    assert ready is False
    assert error == "missing business tables: user_learning_daily_stats"


def test_transcribe_audio_requires_dashscope_api_key(monkeypatch, tmp_path):
    from app.infra import asr_dashscope

    audio_file = tmp_path / "sample.opus"
    audio_file.write_bytes(b"dummy")
    monkeypatch.setattr(asr_dashscope.dashscope, "api_key", "", raising=False)
    with pytest.raises(asr_dashscope.AsrError) as exc:
        asr_dashscope.transcribe_audio_file(str(audio_file), model=asr_dashscope.DEFAULT_MODEL)
    assert exc.value.code == "ASR_API_KEY_MISSING"


def test_transcribe_audio_file_polls_until_success(monkeypatch, tmp_path):
    from app.infra import asr_dashscope

    audio_file = tmp_path / "sample.opus"
    audio_file.write_bytes(b"dummy")
    monkeypatch.setattr(asr_dashscope.dashscope, "api_key", "test-key", raising=False)
    monkeypatch.setattr(
        asr_dashscope.Files,
        "upload",
        lambda file_path, purpose: SimpleNamespace(output={"uploaded_files": [{"file_id": "file_001"}]}),
    )
    monkeypatch.setattr(asr_dashscope.Files, "get", lambda file_id: SimpleNamespace(output={"url": "https://example.com/file.opus"}))
    monkeypatch.setattr(asr_dashscope, "_create_task", lambda model, signed_url: SimpleNamespace(output={"task_id": "task_001"}))

    fetch_responses = [
        SimpleNamespace(status_code=200, output={"task_status": "RUNNING"}),
        SimpleNamespace(
            status_code=200,
            output={"task_status": "SUCCEEDED", "result": {"transcription_url": "https://example.com/result.json"}},
            usage=SimpleNamespace(seconds=12),
        ),
    ]
    monkeypatch.setattr(asr_dashscope, "_fetch_task", lambda model, task_id: fetch_responses.pop(0))

    class _ResultResponse:
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {"transcripts": [{"text": "hello world"}]}

    monkeypatch.setattr(asr_dashscope.requests, "get", lambda url, timeout: _ResultResponse())

    sleep_calls: list[float] = []
    monkeypatch.setattr(asr_dashscope.time, "sleep", lambda seconds: sleep_calls.append(seconds))

    progress_events: list[dict] = []
    result = asr_dashscope.transcribe_audio_file(
        str(audio_file),
        model=asr_dashscope.DEFAULT_MODEL,
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    assert result["task_status"] == "SUCCEEDED"
    assert result["usage_seconds"] == 12
    assert result["preview_text"] == "hello world"
    assert [item["task_status"] for item in progress_events] == ["SUBMITTED", "RUNNING", "SUCCEEDED"]
    assert sleep_calls == [asr_dashscope.ASR_TASK_POLL_SECONDS]


def test_single_asr_progress_emits_waiting_text_without_fake_counts(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    opus_path = tmp_path / "sample.opus"
    opus_path.write_bytes(b"opus")
    req_dir = tmp_path / "req"
    req_dir.mkdir(parents=True, exist_ok=True)

    def fake_transcribe(audio_path, *, model, progress_callback=None, requests_timeout=120):
        if progress_callback:
            progress_callback({"task_status": "RUNNING", "elapsed_seconds": 4, "poll_count": 1})
        return {
            "asr_result_json": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "hello world", "begin_time": 0, "end_time": 1000},
                        ]
                    }
                ]
            },
            "usage_seconds": 1,
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_transcribe)

    progress_events: list[dict] = []
    result = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=opus_path,
        req_dir=req_dir,
        asr_model=QWEN_ASR_MODEL,
        source_duration_ms=1000,
        parallel_enabled=False,
        parallel_threshold_seconds=600,
        segment_target_seconds=300,
        max_concurrency=2,
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    assert result["progress_counters"]["asr_done"] == 1
    assert result["progress_counters"]["segment_total"] == 0
    assert progress_events[0]["current_text"] == "识别中"
    assert progress_events[0]["counters"]["asr_done"] == 0
    assert progress_events[0]["counters"]["asr_estimated"] == 0
    assert any(item["current_text"] == "识别中，已等待 4 秒" for item in progress_events)
    assert progress_events[-1]["current_text"] == "识别完成 1/1"
    assert progress_events[-1]["counters"]["asr_done"] == 1
    assert progress_events[-1]["counters"]["asr_estimated"] == 1


def test_transcribe_file_endpoint_with_stubbed_service(test_client, monkeypatch, tmp_path):
    client, _, _ = test_client
    from app.api.routers import transcribe as transcribe_router

    monkeypatch.setattr(transcribe_router, "BASE_TMP_DIR", tmp_path)

    def fake_transcribe_uploaded_file(upload_file, req_dir, model):
        return {
            "model": model,
            "task_id": "task_stub_001",
            "task_status": "SUCCEEDED",
            "transcription_url": "https://example.com/result.json",
            "preview_text": "hello world",
            "asr_result_json": {"sentences": [{"text": "hello world"}]},
        }

    monkeypatch.setattr(transcribe_router, "transcribe_uploaded_file", fake_transcribe_uploaded_file)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    resp = client.post("/api/transcribe/file", files=files, data={"model": QWEN_ASR_MODEL})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["task_status"] == "SUCCEEDED"
    assert body["source_type"] == "file"
    assert body["model"] == QWEN_ASR_MODEL


def test_transcribe_audio_file_dispatches_to_sensevoice(monkeypatch):
    from app.infra import asr_dashscope as asr_runtime

    captured = {}

    def fake_sensevoice(audio_path, *, progress_callback=None):
        captured["audio_path"] = audio_path
        captured["progress_callback"] = progress_callback
        return {
            "model": SENSEVOICE_ASR_MODEL,
            "task_id": "",
            "task_status": "SUCCEEDED",
            "transcription_url": "",
            "preview_text": "hello from sensevoice",
            "asr_result_json": {"transcripts": [{"text": "hello from sensevoice"}]},
        }

    monkeypatch.setattr(asr_runtime, "_transcribe_audio_file_with_sensevoice", fake_sensevoice)

    result = asr_runtime.transcribe_audio_file("demo.opus", model=SENSEVOICE_ASR_MODEL)
    assert result["model"] == SENSEVOICE_ASR_MODEL
    assert result["preview_text"] == "hello from sensevoice"
    assert captured["audio_path"] == "demo.opus"


def test_create_lesson_rejects_para_model(test_client):
    client, _, _ = test_client
    token = _register_and_login(client, email="reject-model@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post(
        "/api/lessons",
        headers=headers,
        files={"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")},
        data={"asr_model": "paraformer-v2"},
    )
    assert resp.status_code == 400
    data = resp.json()
    assert data["error_code"] == "INVALID_MODEL"
    assert "supported_models" in data.get("detail", {})
    assert QWEN_ASR_MODEL in data["detail"]["supported_models"]
    assert SENSEVOICE_ASR_MODEL in data["detail"]["supported_models"]


def test_auth_register_and_login(test_client):
    client, _, _ = test_client
    token = _register_and_login(client, email="user1@example.com")
    assert token


def test_wallet_and_admin_endpoints(test_client):
    client, session_factory, monkeypatch = test_client
    token = _register_and_login(client, email="admin@example.com")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")

    headers = {"Authorization": f"Bearer {token}"}

    wallet = client.get("/api/wallet/me", headers=headers)
    assert wallet.status_code == 200
    assert "balance_amount_cents" in wallet.json()

    seed_dirty = session_factory()
    try:
        seed_dirty.merge(
            BillingModelRate(
                model_name="qwen-mt-custom",
                points_per_minute=0,
                points_per_1k_tokens=21,
                billing_unit="1k_tokens",
                is_active=True,
                parallel_enabled=False,
                parallel_threshold_seconds=600,
                segment_seconds=300,
                max_concurrency=1,
            )
        )
        seed_dirty.commit()
    finally:
        seed_dirty.close()

    rates = client.get("/api/admin/billing-rates", headers=headers)
    assert rates.status_code == 200
    assert isinstance(rates.json().get("rates"), list)
    assert any("price_per_minute_cents" in item and "cost_per_minute_cents" in item for item in rates.json().get("rates", []))
    admin_model_names = [str(item.get("model_name") or "") for item in rates.json().get("rates", [])]
    admin_mt_models = [name for name in admin_model_names if name.startswith("qwen-mt-")]
    assert admin_mt_models == ["qwen-mt-flash"]

    users = client.get("/api/admin/users", headers=headers)
    assert users.status_code == 200
    assert "items" in users.json()

    logs = client.get("/api/admin/wallet-logs", headers=headers)
    assert logs.status_code == 200
    assert "items" in logs.json()

    translation_logs = client.get("/api/admin/translation-logs", headers=headers)
    assert translation_logs.status_code == 200
    assert "items" in translation_logs.json()

    public_rates = client.get("/api/billing/rates", headers=headers)
    assert public_rates.status_code == 200
    assert "subtitle_settings" in public_rates.json()
    assert public_rates.json()["subtitle_settings"]["semantic_split_default_enabled"] is False
    assert all("price_per_minute_cents" in item and "cost_per_minute_cents" in item for item in public_rates.json()["rates"])
    public_model_names = [str(item.get("model_name") or "") for item in public_rates.json().get("rates", [])]
    public_mt_models = [name for name in public_model_names if name.startswith("qwen-mt-")]
    assert public_mt_models == []

    verify_clean = session_factory()
    try:
        assert verify_clean.get(BillingModelRate, "qwen-mt-custom") is None
    finally:
        verify_clean.close()


def test_local_asr_asset_route_serves_cached_asset(test_client, tmp_path, monkeypatch):
    client, _, _ = test_client
    cache_dir = tmp_path / "local_asr_assets"
    cache_dir.mkdir(parents=True, exist_ok=True)
    asset_path = cache_dir / "sherpa-onnx-asr.js"
    asset_path.write_text("console.log('sensevoice');", encoding="utf-8")

    monkeypatch.setattr(local_asr_assets_router, "LOCAL_ASR_CACHE_DIR", cache_dir)
    monkeypatch.setattr(local_asr_assets_router, "_ensure_asset_cache_populated", lambda: None)

    resp = client.get("/api/local-asr-assets/sherpa-onnx-asr.js")
    assert resp.status_code == 200
    assert "console.log('sensevoice');" in resp.text
    assert resp.headers["content-type"].startswith("application/javascript")


def test_local_asr_asset_route_installs_git_when_missing(monkeypatch):
    commands: list[list[str]] = []
    installed = {"git": False}

    def fake_command_available(name: str) -> bool:
        if name == "apt-get":
            return True
        if name == "git":
            return installed["git"]
        return False

    def fake_run(cmd, **kwargs):
        commands.append(list(cmd))
        if cmd[:3] == ["apt-get", "install", "-y"]:
            installed["git"] = True

    monkeypatch.setattr(local_asr_assets_router, "_command_available", fake_command_available)
    monkeypatch.setattr(local_asr_assets_router, "_git_lfs_ready", lambda: installed["git"])
    monkeypatch.setattr(local_asr_assets_router, "_run_local_asr_cmd", fake_run)
    monkeypatch.setattr(local_asr_assets_router.os, "geteuid", lambda: 0, raising=False)

    local_asr_assets_router._ensure_git_dependencies()

    assert commands == [
        ["apt-get", "update"],
        ["apt-get", "install", "-y", "--no-install-recommends", "git", "git-lfs"],
        ["git", "lfs", "install", "--skip-repo"],
    ]


def test_local_asr_asset_prefetch_needed_when_cache_version_is_stale(tmp_path, monkeypatch):
    cache_dir = tmp_path / "local_asr_assets"
    cache_dir.mkdir(parents=True, exist_ok=True)
    for name in local_asr_assets_router.LOCAL_ASR_ALLOWED_FILES:
        (cache_dir / name).write_bytes(name.encode("utf-8"))
    (cache_dir / local_asr_assets_router.LOCAL_ASR_CACHE_VERSION_FILE).write_text("old-version", encoding="utf-8")

    monkeypatch.setattr(local_asr_assets_router, "LOCAL_ASR_CACHE_DIR", cache_dir)

    assert local_asr_assets_router.has_local_asr_asset_cache() is True
    assert local_asr_assets_router.is_local_asr_asset_cache_current() is False
    assert local_asr_assets_router.local_asr_asset_prefetch_needed() is True


def test_local_asr_asset_download_refreshes_cache_version(tmp_path, monkeypatch):
    cache_dir = tmp_path / "local_asr_assets"
    download_root = tmp_path / "downloads"

    monkeypatch.setattr(local_asr_assets_router, "LOCAL_ASR_CACHE_DIR", cache_dir)
    monkeypatch.setattr(local_asr_assets_router, "LOCAL_ASR_DOWNLOAD_ROOT", download_root)
    monkeypatch.setattr(local_asr_assets_router, "_ensure_git_dependencies", lambda: None)

    def fake_run(cmd, **kwargs):
        if cmd[:2] == ["git", "clone"]:
            target_dir = Path(cmd[-1])
            target_dir.mkdir(parents=True, exist_ok=True)
            for name in local_asr_assets_router.LOCAL_ASR_ALLOWED_FILES:
                (target_dir / name).write_text(f"asset:{name}", encoding="utf-8")

    monkeypatch.setattr(local_asr_assets_router, "_run_local_asr_cmd", fake_run)

    local_asr_assets_router._download_asset_cache(force_refresh=True)

    assert cache_dir.exists()
    assert (cache_dir / local_asr_assets_router.LOCAL_ASR_CACHE_VERSION_FILE).read_text(encoding="utf-8").strip() == local_asr_assets_router.LOCAL_ASR_CACHE_VERSION
    for name in local_asr_assets_router.LOCAL_ASR_ALLOWED_FILES:
        assert (cache_dir / name).read_text(encoding="utf-8") == f"asset:{name}"


def test_extract_local_asr_audio_route_returns_file(test_client, monkeypatch, tmp_path):
    client, _, _ = test_client
    token = _register_and_login(client, email="local-audio-extract@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router

    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)

    def fake_save_upload_file_stream(upload_file, dst_path, *, max_bytes):
      dst_path.write_bytes(b"video")
      return len(b"video")

    def fake_extract_audio_for_asr(input_path, output_path):
      output_path.write_bytes(b"opus-audio")

    monkeypatch.setattr(lesson_router, "save_upload_file_stream", fake_save_upload_file_stream)
    monkeypatch.setattr(lesson_router, "extract_audio_for_asr", fake_extract_audio_for_asr)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"video"), "video/mp4")}
    resp = client.post("/api/lessons/local-asr/audio-extract", headers=headers, files=files)

    assert resp.status_code == 200
    assert resp.content == b"opus-audio"
    assert resp.headers["content-type"].startswith("audio/ogg")


def test_create_local_asr_lesson_task(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-asr@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_service as lesson_service_module
    from app.services import lesson_command_service as lesson_command_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts), total_tokens=36),
    )

    class ImmediateThread:
        def __init__(self, target=None, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            if self._target:
                self._target(**self._kwargs)

    monkeypatch.setattr(lesson_command_service_module.threading, "Thread", ImmediateThread)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "local-asr@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 10_000
        session.add(account)
        session.commit()
    finally:
        session.close()

    payload = {
        "asr_model": "local-sensevoice-small",
        "source_filename": "demo.wav",
        "source_duration_ms": 12_000,
        "asr_payload": {
            "transcripts": [
                {
                    "sentences": [
                        {"text": "Hello world", "begin_time": 0, "end_time": 1400},
                        {"text": "How are you", "begin_time": 1400, "end_time": 3200},
                    ]
                }
            ]
        },
    }

    create_task_resp = client.post("/api/lessons/tasks/local-asr", headers=headers, json=payload)
    assert create_task_resp.status_code == 200
    task_id = create_task_resp.json()["task_id"]
    assert task_id

    task_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert task_resp.status_code == 200
    task_payload = task_resp.json()
    assert task_payload["status"] == "succeeded"
    assert task_payload["lesson"]["asr_model"] == "local-sensevoice-small"


def test_admin_update_billing_rate_rejects_non_flash_mt_model(test_client):
    client, _, monkeypatch = test_client
    token = _register_and_login(client, email="billing-admin@example.com")
    monkeypatch.setenv("ADMIN_EMAILS", "billing-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        "/api/admin/billing-rates/qwen-mt-custom",
        headers=headers,
        json={
            "points_per_minute": 0,
            "points_per_1k_tokens": 15,
            "billing_unit": "1k_tokens",
            "is_active": True,
            "parallel_enabled": False,
            "parallel_threshold_seconds": 600,
            "segment_seconds": 300,
            "max_concurrency": 1,
        },
    )
    assert resp.status_code == 400
    payload = resp.json()
    assert payload["error_code"] == "MT_MODEL_DEPRECATED"


def test_admin_subtitle_settings_roundtrip(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "subtitle-admin@example.com")
    admin_token = _register_and_login(client, email="subtitle-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    update_resp = client.put(
        "/api/admin/subtitle-settings",
        headers=admin_headers,
        json={
            "semantic_split_default_enabled": True,
            "subtitle_split_enabled": True,
            "subtitle_split_target_words": 16,
            "subtitle_split_max_words": 26,
            "semantic_split_max_words_threshold": 20,
            "semantic_split_timeout_seconds": 35,
            "translation_batch_max_chars": 3200,
        },
    )
    assert update_resp.status_code == 200
    payload = update_resp.json()["settings"]
    assert payload["semantic_split_default_enabled"] is True
    assert payload["subtitle_split_target_words"] == 16
    assert payload["semantic_split_max_words_threshold"] == 20
    assert payload["translation_batch_max_chars"] == 3200

    fetch_resp = client.get("/api/admin/subtitle-settings", headers=admin_headers)
    assert fetch_resp.status_code == 200
    assert fetch_resp.json()["settings"]["semantic_split_timeout_seconds"] == 35
    assert fetch_resp.json()["settings"]["translation_batch_max_chars"] == 3200


def test_admin_sensevoice_settings_roundtrip_and_rollback(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "sensevoice-admin@example.com")
    admin_token = _register_and_login(client, email="sensevoice-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    initial_resp = client.get("/api/admin/sensevoice-settings/history", headers=admin_headers)
    assert initial_resp.status_code == 200
    initial_settings = initial_resp.json()["current"]

    update_resp = client.put(
        "/api/admin/sensevoice-settings",
        headers=admin_headers,
        json={
            "model_dir": "iic/SenseVoiceSmall",
            "trust_remote_code": True,
            "remote_code": "/srv/models/sensevoice/model.py",
            "device": "cpu",
            "language": "en",
            "vad_model": "fsmn-vad",
            "vad_max_single_segment_time": 45000,
            "use_itn": False,
            "batch_size_s": 80,
            "merge_vad": False,
            "merge_length_s": 20,
            "ban_emo_unk": True,
        },
    )
    assert update_resp.status_code == 200
    payload = update_resp.json()["settings"]
    assert payload["trust_remote_code"] is True
    assert payload["device"] == "cpu"
    assert payload["batch_size_s"] == 80
    assert payload["ban_emo_unk"] is True

    fetch_resp = client.get("/api/admin/sensevoice-settings", headers=admin_headers)
    assert fetch_resp.status_code == 200
    assert fetch_resp.json()["settings"]["language"] == "en"

    rollback_resp = client.post("/api/admin/sensevoice-settings/rollback-last", headers=admin_headers)
    assert rollback_resp.status_code == 200
    rollback_payload = rollback_resp.json()["settings"]
    assert rollback_payload["model_dir"] == initial_settings["model_dir"]
    assert rollback_payload["device"] == initial_settings["device"]
    assert rollback_payload["batch_size_s"] == initial_settings["batch_size_s"]


def test_admin_translation_logs_endpoint_filters_by_task_and_success(test_client, monkeypatch):
    client, session_factory, _ = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "translation-admin@example.com")
    admin_token = _register_and_login(client, email="translation-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "translation-admin@example.com").one()
        session.add_all(
            [
                TranslationRequestLog(
                    trace_id="trace-a",
                    task_id="task-demo",
                    lesson_id=None,
                    user_id=user.id,
                    sentence_idx=0,
                    attempt_no=1,
                    provider="dashscope_compatible",
                    model_name="qwen-mt-flash",
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    input_text_preview="hello world",
                    provider_request_id="req_success",
                    status_code=200,
                    finish_reason="stop",
                    prompt_tokens=10,
                    completion_tokens=4,
                    total_tokens=14,
                    success=True,
                    error_code=None,
                    error_message="",
                    started_at=datetime.utcnow(),
                    finished_at=datetime.utcnow(),
                    created_at=datetime.utcnow(),
                ),
                TranslationRequestLog(
                    trace_id="trace-b",
                    task_id="task-other",
                    lesson_id=None,
                    user_id=user.id,
                    sentence_idx=1,
                    attempt_no=1,
                    provider="dashscope_compatible",
                    model_name="qwen-mt-flash",
                    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    input_text_preview="second line",
                    provider_request_id="req_failed",
                    status_code=429,
                    finish_reason=None,
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0,
                    success=False,
                    error_code="REQUEST_FAILED",
                    error_message="rate limit",
                    started_at=datetime.utcnow(),
                    finished_at=datetime.utcnow(),
                    created_at=datetime.utcnow(),
                ),
            ]
        )
        session.commit()
    finally:
        session.close()

    resp = client.get(
        "/api/admin/translation-logs",
        params={"task_id": "task-demo", "success": "success"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["total"] == 1
    assert payload["items"][0]["task_id"] == "task-demo"
    assert payload["items"][0]["success"] is True


def test_subtitle_settings_backfill_uses_bool_binding_for_postgres(monkeypatch):
    from app.services import billing as billing_runtime

    class DummyBind:
        dialect = SimpleNamespace(name="postgresql")

    class DummySession:
        def __init__(self):
            self.executed: list[tuple[str, dict]] = []
            self.commit_count = 0

        def get_bind(self):
            return DummyBind()

        def execute(self, stmt, params=None):
            self.executed.append((str(stmt), dict(params or {})))
            return SimpleNamespace(rowcount=1)

        def commit(self):
            self.commit_count += 1

    dummy = DummySession()
    monkeypatch.setattr(billing_runtime, "_qualified_subtitle_settings_table", lambda _db: "app.subtitle_settings")
    monkeypatch.setattr(
        billing_runtime,
        "_subtitle_settings_column_names",
        lambda _db: {"semantic_split_default_enabled", "subtitle_split_enabled", "updated_at"},
    )

    changed = billing_runtime._backfill_subtitle_settings_values(dummy)
    assert changed is True
    assert dummy.commit_count >= 1

    bool_updates = [(sql, params) for sql, params in dummy.executed if "semantic_split_default_enabled" in sql or "subtitle_split_enabled" in sql]
    assert bool_updates
    assert all("default_value" in params for _, params in bool_updates)
    assert all(isinstance(params["default_value"], bool) for _, params in bool_updates)
    assert all("= 0" not in sql and "= 1" not in sql for sql, _ in bool_updates)


def test_public_billing_rates_self_heals_missing_subtitle_settings_table(test_client):
    client, session_factory, _ = test_client

    session = session_factory()
    try:
        session.execute(text("DROP TABLE subtitle_settings"))
        session.commit()
    finally:
        session.close()

    resp = client.get("/api/billing/rates")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["subtitle_settings"]["semantic_split_default_enabled"] is False

    verify = session_factory()
    try:
        row = get_subtitle_settings(verify)
        assert isinstance(row, SubtitleSetting)
        assert row.id == 1
    finally:
        verify.close()


def test_admin_sensevoice_settings_self_heals_missing_table(test_client, monkeypatch):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "sensevoice-heal-admin@example.com")
    admin_token = _register_and_login(client, email="sensevoice-heal-admin@example.com")
    headers = {"Authorization": f"Bearer {admin_token}"}

    session = session_factory()
    try:
        session.execute(text("DROP TABLE IF EXISTS sensevoice_settings"))
        session.commit()
    finally:
        session.close()

    resp = client.put(
        "/api/admin/sensevoice-settings",
        headers=headers,
        json={
            "model_dir": "iic/SenseVoiceSmall",
            "trust_remote_code": False,
            "remote_code": "",
            "device": "cuda:0",
            "language": "auto",
            "vad_model": "fsmn-vad",
            "vad_max_single_segment_time": 30000,
            "use_itn": True,
            "batch_size_s": 60,
            "merge_vad": True,
            "merge_length_s": 15,
            "ban_emo_unk": False,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["settings"]["model_dir"] == "iic/SenseVoiceSmall"
    assert body["settings"]["device"] == "cuda:0"

    verify = session_factory()
    try:
        row = get_sensevoice_settings(verify)
        assert row.id == 1
        assert row.model_dir == "iic/SenseVoiceSmall"
    finally:
        verify.close()


def test_admin_subtitle_settings_update_self_heals_missing_table(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "self-heal-admin@example.com")
    admin_token = _register_and_login(client, email="self-heal-admin@example.com")
    headers = {"Authorization": f"Bearer {admin_token}"}

    session = session_factory()
    try:
        session.execute(text("DROP TABLE subtitle_settings"))
        session.commit()
    finally:
        session.close()

    resp = client.put(
        "/api/admin/subtitle-settings",
        headers=headers,
        json={
            "semantic_split_default_enabled": True,
            "subtitle_split_enabled": True,
            "subtitle_split_target_words": 17,
            "subtitle_split_max_words": 29,
            "semantic_split_max_words_threshold": 21,
            "semantic_split_timeout_seconds": 50,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["settings"]["semantic_split_default_enabled"] is True
    assert body["settings"]["semantic_split_timeout_seconds"] == 50
    assert body["settings"]["translation_batch_max_chars"] == 2600


def test_subtitle_settings_endpoints_self_heal_missing_columns(test_client):
    client, session_factory, monkeypatch = test_client
    from app import main as app_main

    _recreate_legacy_subtitle_settings(session_factory)

    probe_session = session_factory()
    try:
        probe_engine = probe_session.get_bind()
    finally:
        probe_session.close()

    monkeypatch.setattr(app_main, "engine", probe_engine)
    monkeypatch.setattr(app_main, "DATABASE_URL", str(probe_engine.url))
    monkeypatch.setattr(app_main, "SessionLocal", session_factory)

    ready_resp = client.get("/health/ready")
    assert ready_resp.status_code == 503
    assert ready_resp.json()["ok"] is False

    public_resp = client.get("/api/billing/rates")
    assert public_resp.status_code == 200
    assert public_resp.json()["subtitle_settings"]["semantic_split_default_enabled"] is False

    from app.api.deps.auth import get_admin_user as admin_dep

    client.app.dependency_overrides[admin_dep] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    history_resp = client.get("/api/admin/subtitle-settings/history")
    assert history_resp.status_code == 200
    assert history_resp.json()["ok"] is True

    ready_after_repair = client.get("/health/ready")
    assert ready_after_repair.status_code == 200
    assert ready_after_repair.json()["ok"] is True

    verify = session_factory()
    try:
        row = get_subtitle_settings(verify)
        assert int(row.semantic_split_timeout_seconds) == 40
        assert int(row.translation_batch_max_chars) == 2600
        column_names = {
            str(item["name"])
            for item in verify.execute(text("PRAGMA table_info(subtitle_settings)")).mappings().all()
        }
        assert "semantic_split_timeout_seconds" in column_names
        assert "translation_batch_max_chars" in column_names
    finally:
        verify.close()


def test_redeem_code_admin_and_wallet_flow(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "redeem-admin@example.com")

    user_token = _register_and_login(client, email="redeem-user@example.com")
    admin_token = _register_and_login(client, email="redeem-admin@example.com")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    now = datetime.utcnow()
    batch_resp = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "regression_batch",
            "face_value_points": 66,
            "generate_quantity": 2,
            "active_from": now.isoformat(),
            "expire_at": (now + timedelta(days=2)).isoformat(),
            "daily_limit_per_user": 1,
            "remark": "regression",
        },
    )
    assert batch_resp.status_code == 200
    batch_data = batch_resp.json()
    assert batch_data["batch"]["generated_count"] == 2
    generated_codes = batch_data["generated_codes"]
    assert len(generated_codes) == 2

    wallet_before = client.get("/api/wallet/me", headers=user_headers)
    assert wallet_before.status_code == 200
    before_points = wallet_before.json()["balance_points"]

    redeem_ok = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[0]})
    assert redeem_ok.status_code == 200
    assert redeem_ok.json()["redeemed_points"] == 66
    assert redeem_ok.json()["balance_points"] == before_points + 66

    redeem_used = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[0]})
    assert redeem_used.status_code == 400
    assert redeem_used.json()["error_code"] == "REDEEM_CODE_ALREADY_USED"

    redeem_limit = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": generated_codes[1]})
    assert redeem_limit.status_code == 400
    assert redeem_limit.json()["error_code"] == "REDEEM_CODE_DAILY_LIMIT_EXCEEDED"

    logs = client.get(
        "/api/admin/wallet-logs",
        headers=admin_headers,
        params={"user_email": "redeem-user@example.com", "event_type": "redeem_code"},
    )
    assert logs.status_code == 200
    assert logs.json()["total"] >= 1
    assert any(item["event_type"] == "redeem_code" for item in logs.json()["items"])

    audit = client.get("/api/admin/redeem-audit", headers=admin_headers, params={"user_email": "redeem-user@example.com"})
    assert audit.status_code == 200
    assert audit.json()["total"] >= 3
    assert any(item["success"] is True for item in audit.json()["items"])
    assert any(item["success"] is False for item in audit.json()["items"])

    forbidden = client.post(
        "/api/admin/redeem-batches",
        headers=user_headers,
        json={
            "batch_name": "forbidden",
            "face_value_points": 50,
            "generate_quantity": 1,
        },
    )
    assert forbidden.status_code == 403


def test_lessons_progress_and_check(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="learner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "learner@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="demo",
            source_filename="demo.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=10000,
            media_storage="server",
            source_duration_ms=10000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好 世界",
                tokens_json=["hello", "world"],
                audio_clip_path="/tmp/not_exists.opus",
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    get_progress = client.get(f"/api/lessons/{lesson_id}/progress", headers=headers)
    assert get_progress.status_code == 200

    update_progress = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 500},
    )
    assert update_progress.status_code == 200

    check = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["hello", "world"]},
    )
    assert check.status_code == 200
    assert check.json()["passed"] is True


def test_legacy_lesson_detail_and_check_spell_usd_amounts(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="legacy-money@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "legacy-money@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="legacy money",
            source_filename="legacy_money.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="$40?",
                text_zh="40美元？",
                tokens_json=["$40"],
                audio_clip_path=None,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["sentences"][0]["text_en"] == "forty dollars?"
    assert detail_data["sentences"][0]["tokens"] == ["forty", "dollars"]

    check_resp = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["forty", "dollars"]},
    )
    assert check_resp.status_code == 200
    check_data = check_resp.json()
    assert check_data["passed"] is True
    assert check_data["expected_tokens"] == ["forty", "dollars"]


def test_lesson_rename_and_delete_endpoints(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="rename-owner@example.com")
    other_token = _register_and_login(client, email="rename-other@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "rename-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="old title",
            source_filename="rename.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=3000,
            media_storage="client_indexeddb",
            source_duration_ms=3000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        lesson_id = lesson.id
        session.commit()
    finally:
        session.close()

    rename_ok = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "  New Lesson Title  "})
    assert rename_ok.status_code == 200
    assert rename_ok.json()["title"] == "New Lesson Title"

    rename_empty = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "   "})
    assert rename_empty.status_code == 400
    assert rename_empty.json()["error_code"] == "INVALID_TITLE"

    rename_too_long = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "x" * 256})
    assert rename_too_long.status_code == 400
    assert rename_too_long.json()["error_code"] == "INVALID_TITLE"

    delete_cross_user = client.delete(f"/api/lessons/{lesson_id}", headers=other_headers)
    assert delete_cross_user.status_code == 404

    delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=owner_headers)
    assert delete_ok.status_code == 200
    assert delete_ok.json()["ok"] is True
    assert delete_ok.json()["lesson_id"] == lesson_id

    get_deleted = client.get(f"/api/lessons/{lesson_id}", headers=owner_headers)
    assert get_deleted.status_code == 404


def test_delete_lesson_clears_wallet_ledger_reference(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="delete-ledger-owner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "delete-ledger-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="ledger linked lesson",
            source_filename="ledger.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()

        ledger = WalletLedger(
            user_id=owner.id,
            operator_user_id=None,
            event_type="consume",
            delta_points=0,
            balance_after=0,
            model_name="qwen3-asr-flash-filetrans",
            duration_ms=lesson.duration_ms,
            lesson_id=lesson.id,
            note="regression: lesson delete should clear reference",
        )
        session.add(ledger)
        session.flush()
        lesson_id = lesson.id
        ledger_id = ledger.id
        session.commit()
    finally:
        session.close()

    delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=headers)
    assert delete_ok.status_code == 200
    assert delete_ok.json()["ok"] is True
    assert delete_ok.json()["lesson_id"] == lesson_id

    verify = session_factory()
    try:
        ledger_after = verify.query(WalletLedger).filter(WalletLedger.id == ledger_id).one()
        assert ledger_after.lesson_id is None
    finally:
        verify.close()


def test_create_lesson_endpoint_with_stubbed_service(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="creator@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)

    captured = {}

    def fake_generate(upload_file, req_dir, owner_id, asr_model, db, progress_callback=None, semantic_split_enabled=None):
        captured["semantic_split_enabled"] = semantic_split_enabled
        lesson = Lesson(
            user_id=owner_id,
            title="fake lesson",
            source_filename="fake.mp4",
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1234,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello",
                text_zh="你好",
                tokens_json=["hello"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello",
                    "text_zh": "你好",
                    "tokens": ["hello"],
                    "audio_url": None,
                }
            ],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_upload", fake_generate)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    data = {"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "true"}
    resp = client.post("/api/lessons", headers=headers, files=files, data=data)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson"]["title"] == "fake lesson"
    assert body["lesson"]["media_storage"] == "client_indexeddb"
    assert body["lesson"]["source_duration_ms"] == 1234
    assert body["lesson"]["sentences"][0]["audio_url"] is None
    assert body["lesson"]["subtitle_cache_seed"]["semantic_split_enabled"] is True
    assert body["lesson"]["subtitle_cache_seed"]["split_mode"] == "word_level_split+semantic"
    assert body["lesson"]["subtitle_cache_seed"]["asr_payload"]["transcripts"][0]["words"][0]["text"] == "hello"
    assert captured["semantic_split_enabled"] is True


def test_lesson_media_prefers_source_filename_content_type(test_client, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="media-learner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    media_path = tmp_path / "stored_media_without_ext"
    media_path.write_bytes(b"fake-video-binary")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "media-learner@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="media mime test",
            source_filename="lesson-video.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=5000,
            media_storage="server",
            source_duration_ms=5000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            MediaAsset(
                lesson_id=lesson.id,
                original_path=str(media_path),
                opus_path=str(media_path),
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("video/mp4")


def test_local_media_mode_requires_client_binding(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-media@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "local-media@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="local-only",
            source_filename="local.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好 世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["media_storage"] == "client_indexeddb"
    assert detail_data["source_duration_ms"] == 2000
    assert detail_data["sentences"][0]["audio_url"] is None

    media_resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert media_resp.status_code == 409
    assert media_resp.json()["error_code"] == "LOCAL_MEDIA_REQUIRED"

    clip_resp = client.get(f"/api/lessons/{lesson_id}/sentences/0/audio", headers=headers)
    assert clip_resp.status_code == 409
    assert clip_resp.json()["error_code"] == "LOCAL_MEDIA_REQUIRED"


def test_create_lesson_task_and_poll_success(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="task-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router

    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_router, "SessionLocal", session_factory)

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_router.threading, "Thread", InlineThread)

    captured = {}

    def fake_generate_from_saved_file(
        *,
        source_path,
        source_filename,
        req_dir,
        owner_id,
        asr_model,
        db,
        progress_callback=None,
        task_id=None,
        semantic_split_enabled=None,
    ):
        captured["semantic_split_enabled"] = semantic_split_enabled
        captured["task_id"] = task_id
        if progress_callback:
            progress_callback({"stage_key": "convert_audio", "stage_status": "completed", "overall_percent": 20, "current_text": "转换音频格式完成"})
            progress_callback({"stage_key": "asr_transcribe", "stage_status": "completed", "overall_percent": 60, "current_text": "转写字幕 3/约3", "counters": {"asr_done": 3, "asr_estimated": 3}})
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "completed",
                    "overall_percent": 90,
                    "current_text": "翻译字幕 3/3",
                    "counters": {"translate_done": 3, "translate_total": 3},
                    "translation_debug": {
                        "total_sentences": 3,
                        "failed_sentences": 1,
                        "request_count": 3,
                        "success_request_count": 2,
                        "usage": {"prompt_tokens": 30, "completion_tokens": 12, "total_tokens": 42, "charged_points": 1},
                        "latest_error_summary": "第2句失败：REQUEST_FAILED rate limit",
                    },
                }
            )
            progress_callback({"stage_key": "write_lesson", "stage_status": "completed", "overall_percent": 100, "current_text": "课程生成完成"})

        lesson = Lesson(
            user_id=owner_id,
            title="task lesson",
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1200,
            media_storage="client_indexeddb",
            source_duration_ms=1200,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello world",
                text_zh="你好世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello",
                    "text_zh": "你好",
                    "tokens": ["hello"],
                    "audio_url": None,
                }
            ],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_saved_file", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        files={"video_file": ("task.mp4", io.BytesIO(b"dummy"), "video/mp4")},
        data={"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "false"},
    )
    assert create_resp.status_code == 200
    assert captured["semantic_split_enabled"] is False
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "succeeded"
    assert payload["overall_percent"] == 100
    assert payload["lesson"]["title"] == "task lesson"
    assert payload["subtitle_cache_seed"]["semantic_split_enabled"] is True
    assert payload["lesson"]["subtitle_cache_seed"]["split_mode"] == "word_level_split+semantic"
    assert payload["counters"]["translate_done"] == 3
    assert payload["translation_debug"]["failed_sentences"] == 1
    assert payload["translation_debug"]["request_count"] == 3
    assert payload["translation_debug"]["usage"]["total_tokens"] == 42
    assert payload["translation_debug"]["latest_error_summary"] == "第2句失败：REQUEST_FAILED rate limit"
    assert all(item["status"] == "completed" for item in payload["stages"])



def test_generate_from_saved_file_records_mt_usage_and_consume(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="billing-user@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "billing-user@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        from app.services import lesson_service as lesson_service_module

        req_dir = tmp_path / "req"
        req_dir.mkdir(parents=True, exist_ok=True)
        source_path = tmp_path / "source.mp4"
        source_path.write_bytes(b"video")

        monkeypatch.setattr(lesson_service_module, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
        monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda _path: 60_000)
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "_transcribe_with_optional_parallel",
            staticmethod(lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": []}]}, "usage_seconds": 60}),
        )
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "build_subtitle_variant",
            staticmethod(
                lambda **kwargs: {
                    "semantic_split_enabled": False,
                    "split_mode": "word_level_split",
                    "source_word_count": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 900,
                            "text_en": "hello world",
                            "text_zh": "你好世界",
                            "tokens": ["hello", "world"],
                        }
                    ],
                    "translate_failed_count": 0,
                    "translation_attempt_records": [
                        {
                            "sentence_idx": 0,
                            "attempt_no": 1,
                            "provider": "dashscope_compatible",
                            "model_name": "qwen-mt-flash",
                            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                            "input_text_preview": "hello world",
                            "provider_request_id": "req_test",
                            "status_code": 200,
                            "finish_reason": "stop",
                            "prompt_tokens": 40,
                            "completion_tokens": 20,
                            "total_tokens": 60,
                            "success": True,
                            "error_code": "",
                            "error_message": "",
                            "started_at": datetime.utcnow(),
                            "finished_at": datetime.utcnow(),
                        }
                    ],
                    "translation_request_count": 1,
                    "translation_success_request_count": 1,
                    "translation_usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60, "charged_points": 0},
                    "latest_translate_error_summary": "",
                }
            ),
        )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="source.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            task_id="task_billing_test",
            semantic_split_enabled=False,
        )

        mt_ledger = (
            session.query(WalletLedger)
            .filter(WalletLedger.lesson_id == lesson.id, WalletLedger.event_type == "consume_translate")
            .one()
        )
        assert mt_ledger.model_name == "qwen-mt-flash"
        assert mt_ledger.delta_points == -1

        translation_log = session.query(TranslationRequestLog).filter(TranslationRequestLog.task_id == "task_billing_test").one()
        assert translation_log.lesson_id == lesson.id
        assert translation_log.success is True
        assert translation_log.total_tokens == 60
    finally:
        session.close()


def test_generate_from_saved_file_ignores_translation_log_persist_failure(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="billing-user-log-fail@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "billing-user-log-fail@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        from app.services import lesson_service as lesson_service_module

        req_dir = tmp_path / "req_log_fail"
        req_dir.mkdir(parents=True, exist_ok=True)
        source_path = tmp_path / "source_log_fail.mp4"
        source_path.write_bytes(b"video")

        monkeypatch.setattr(lesson_service_module, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
        monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda _path: 60_000)
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "_transcribe_with_optional_parallel",
            staticmethod(lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": []}]}, "usage_seconds": 60}),
        )
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "build_subtitle_variant",
            staticmethod(
                lambda **kwargs: {
                    "semantic_split_enabled": False,
                    "split_mode": "word_level_split",
                    "source_word_count": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 900,
                            "text_en": "hello world",
                            "text_zh": "你好世界",
                            "tokens": ["hello", "world"],
                        }
                    ],
                    "translate_failed_count": 0,
                    "translation_attempt_records": [
                        {
                            "sentence_idx": 0,
                            "attempt_no": 1,
                            "provider": "dashscope_compatible",
                            "model_name": "qwen-mt-flash",
                            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                            "input_text_preview": "hello world",
                            "provider_request_id": "req_test",
                            "status_code": 200,
                            "finish_reason": "stop",
                            "prompt_tokens": 40,
                            "completion_tokens": 20,
                            "total_tokens": 60,
                            "success": True,
                            "error_code": "",
                            "error_message": "",
                            "started_at": datetime.utcnow(),
                            "finished_at": datetime.utcnow(),
                        }
                    ],
                    "translation_request_count": 1,
                    "translation_success_request_count": 1,
                    "translation_usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60, "charged_points": 0},
                    "latest_translate_error_summary": "",
                }
            ),
        )
        monkeypatch.setattr(
            lesson_service_module,
            "append_translation_request_logs",
            lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("translation log insert failed")),
        )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="source_log_fail.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            task_id="task_billing_log_fail",
            semantic_split_enabled=False,
        )

        assert lesson.id > 0
        lesson_sentences = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).all()
        assert len(lesson_sentences) == 1
        translation_logs = session.query(TranslationRequestLog).filter(TranslationRequestLog.task_id == "task_billing_log_fail").all()
        assert translation_logs == []
    finally:
        session.close()


def test_regenerate_lesson_subtitle_variant_endpoint(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant lesson",
            source_filename="variant.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    captured = {}

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, before_translate_callback=None, translation_progress_callback=None):
        captured["asr_payload"] = asr_payload
        captured["semantic_split_enabled"] = semantic_split_enabled
        captured["task_id"] = task_id
        return {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 3,
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 1200,
                    "text_en": "hello world again",
                    "text_zh": "你好世界再次",
                    "tokens": ["hello", "world", "again"],
                    "audio_url": None,
                }
            ],
            "translate_failed_count": 0,
        }

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    resp = client.post(
        f"/api/lessons/{lesson_id}/subtitle-variants",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson_id"] == lesson_id
    assert body["semantic_split_enabled"] is True
    assert body["split_mode"] == "word_level_split+semantic"
    assert body["source_word_count"] == 3
    assert body["sentences"][0]["text_en"] == "hello world again"
    assert captured["semantic_split_enabled"] is True
    assert captured["asr_payload"]["transcripts"][0]["words"][0]["text"] == "hello"


def test_regenerate_lesson_subtitle_variant_returns_asr_sentences_when_semantic_disabled(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-plain-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-plain-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="plain variant lesson",
            source_filename="plain-variant.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2200,
            media_storage="client_indexeddb",
            source_duration_ms=2200,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{text}" for text in texts]),
    )

    resp = client.post(
        f"/api/lessons/{lesson_id}/subtitle-variants",
        headers=headers,
        json={
            "asr_payload": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "Hello there", "begin_time": 0, "end_time": 900},
                            {"text": "General Kenobi", "begin_time": 900, "end_time": 1900},
                        ],
                        "words": [
                            _word_entry("Hello", 0, 300),
                            _word_entry("there", 300, 900),
                            _word_entry("General", 900, 1400),
                            _word_entry("Kenobi", 1400, 1900),
                        ],
                    }
                ]
            },
            "semantic_split_enabled": False,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["semantic_split_enabled"] is False
    assert body["split_mode"] == "asr_sentences"
    assert body["strategy_version"] == 2
    assert [item["text_en"] for item in body["sentences"]] == ["Hello there", "General Kenobi"]
    assert [item["text_zh"] for item in body["sentences"]] == ["中:Hello there", "中:General Kenobi"]


def test_regenerate_lesson_subtitle_variant_stream_endpoint(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-stream-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-stream-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant stream lesson",
            source_filename="variant-stream.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, progress_callback=None, before_translate_callback=None, translation_progress_callback=None):
        if progress_callback:
            progress_callback(
                {
                    "stage": "prepare",
                    "message": "正在重切分句",
                    "translate_done": 0,
                    "translate_total": 0,
                    "semantic_split_enabled": bool(semantic_split_enabled),
                }
            )
            progress_callback(
                {
                    "stage": "translate",
                    "message": "正在翻译 1/2",
                    "translate_done": 1,
                    "translate_total": 2,
                    "semantic_split_enabled": bool(semantic_split_enabled),
                }
            )
        return {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 3,
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 1200,
                    "text_en": "hello world again",
                    "text_zh": "你好世界再次",
                    "tokens": ["hello", "world", "again"],
                    "audio_url": None,
                }
            ],
        }

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    with client.stream(
        "POST",
        f"/api/lessons/{lesson_id}/subtitle-variants/stream",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": True,
        },
    ) as resp:
        assert resp.status_code == 200
        payload = "".join(resp.iter_text())

    events = _parse_sse_events(payload)
    assert [event for event, _ in events[:-1]] == ["progress", "progress"]
    assert events[-1][0] == "result"
    assert events[-1][1]["ok"] is True
    assert events[-1][1]["lesson_id"] == lesson_id
    assert events[-1][1]["semantic_split_enabled"] is True
    assert events[-1][1]["sentences"][0]["text_en"] == "hello world again"


def test_regenerate_lesson_subtitle_variant_stream_endpoint_emits_error(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-stream-error@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-stream-error@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant stream error",
            source_filename="variant-stream-error.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, progress_callback=None, before_translate_callback=None, translation_progress_callback=None):
        raise RuntimeError("stream explode")

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    with client.stream(
        "POST",
        f"/api/lessons/{lesson_id}/subtitle-variants/stream",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": False,
        },
    ) as resp:
        assert resp.status_code == 200
        payload = "".join(resp.iter_text())

    events = _parse_sse_events(payload)
    assert len(events) == 1
    assert events[0][0] == "error"
    assert events[0][1]["error_code"] == "INTERNAL_ERROR"
    assert events[0][1]["message"] == "重新生成字幕失败"
def test_parallel_asr_trigger_by_duration(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    single_calls = {"count": 0}

    def fake_single_transcribe(path: str, model: str):
        single_calls["count"] += 1
        return {
            "asr_result_json": {
                "properties": {"original_duration_in_milliseconds": 4000},
                "transcripts": [{"channel_id": 0, "sentences": [{"sentence_id": 0, "begin_time": 0, "end_time": 900, "text": "single"}]}],
            }
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_single_transcribe)
    result_single = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=tmp_path / "single.opus",
        req_dir=tmp_path,
        asr_model=QWEN_ASR_MODEL,
        source_duration_ms=4000,
        parallel_enabled=True,
        parallel_threshold_seconds=10,
        segment_target_seconds=2,
        max_concurrency=4,
        progress_callback=None,
    )
    payload_single = result_single["asr_payload"]
    assert single_calls["count"] == 1
    assert payload_single["transcripts"][0]["sentences"][0]["text"] == "single"

    monkeypatch.setattr(
        lesson_service_module,
        "_split_audio_segments",
        lambda source_audio, segments_dir, target_seconds, search_window_seconds, duration_ms: [
            (0, 0, tmp_path / "seg0.opus"),
            (1, 5000, tmp_path / "seg1.opus"),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "_transcribe_segment",
        lambda segment_index, segment_start_ms, segment_path, asr_model: (
            segment_index,
            [
                {
                    "text": f"seg-{segment_index}",
                    "surface": f"seg-{segment_index}",
                    "punctuation": "",
                    "begin_ms": segment_start_ms,
                    "end_ms": segment_start_ms + 1000,
                }
            ],
            [{"text": f"seg-{segment_index}", "begin_ms": segment_start_ms, "end_ms": segment_start_ms + 1000}],
            None,
        ),
    )
    result_parallel = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=tmp_path / "parallel.opus",
        req_dir=tmp_path,
        asr_model=QWEN_ASR_MODEL,
        source_duration_ms=15000,
        parallel_enabled=True,
        parallel_threshold_seconds=10,
        segment_target_seconds=5,
        max_concurrency=4,
        progress_callback=None,
    )
    payload_parallel = result_parallel["asr_payload"]
    assert payload_parallel["transcripts"][0]["words"][0]["text"] == "seg-0"
    assert payload_parallel["transcripts"][0]["words"][1]["text"] == "seg-1"


def test_build_lesson_sentences_prefers_word_level_split():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "words": [
                    _word_entry("Hello", 0, 200),
                    _word_entry("world", 200, 500, punctuation="."),
                    _word_entry("This", 600, 800),
                    _word_entry("is", 800, 900),
                    _word_entry("a", 900, 950),
                    _word_entry("test", 950, 1300, punctuation="."),
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True, target_words=8, max_words=12)

    assert result["mode"] == "word_level_split"
    assert [item["text"] for item in result["sentences"]] == ["Hello world.", "This is a test."]


def test_build_lesson_sentences_falls_back_when_words_missing():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "sentences": [
                    {"text": "fallback line", "begin_time": 0, "end_time": 900},
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True)

    assert result["mode"] == "asr_sentences_no_words"
    assert result["sentences"][0]["text"] == "fallback line"


def test_build_lesson_sentences_splits_on_connectors():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "words": [
                    _word_entry("I", 0, 100),
                    _word_entry("stayed", 100, 250),
                    _word_entry("home", 250, 400),
                    _word_entry("last", 400, 520),
                    _word_entry("night", 520, 700),
                    _word_entry("because", 700, 900),
                    _word_entry("the", 900, 1000),
                    _word_entry("storm", 1000, 1150),
                    _word_entry("was", 1150, 1250),
                    _word_entry("getting", 1250, 1400),
                    _word_entry("worse", 1400, 1650),
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True, target_words=12, max_words=20)

    assert result["mode"] == "word_level_split"
    assert len(result["sentences"]) == 2
    assert result["sentences"][1]["text"].startswith("because")


def test_split_audio_segments_prefers_silence(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "_detect_silence_ranges",
        lambda source_audio, search_start_sec, search_end_sec: [(5.2, 5.9)],
    )

    def fake_run_cmd(cmd, **kwargs):
        output_path = Path(cmd[-1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"segment")

    monkeypatch.setattr(lesson_service_module, "run_cmd", fake_run_cmd)

    segments = lesson_service_module._split_audio_segments(
        tmp_path / "source.opus",
        tmp_path / "segments",
        target_seconds=5,
        search_window_seconds=2,
        duration_ms=9000,
    )

    assert len(segments) == 2
    assert segments[0][1] == 0
    assert segments[1][1] == 5700


def test_settle_reserved_points_allows_negative_balance(test_client):
    client, session_factory, _ = test_client
    _register_and_login(client, email="settle-negative@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "settle-negative@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 10
        session.add(account)
        session.commit()

        ledger = settle_reserved_points(
            session,
            user_id=user.id,
            model_name=QWEN_ASR_MODEL,
            reserved_points=10,
            actual_points=25,
            duration_ms=120000,
            note="regression settle negative",
        )
        session.commit()
        session.refresh(account)
        assert ledger is not None
        assert ledger.event_type == "consume"
        assert ledger.delta_points == -15
        assert account.balance_points == -5
    finally:
        session.close()


def test_generate_lesson_settles_with_usage_seconds(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="usage-settle@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts)),
    )
    monkeypatch.setattr(
        lesson_service_module,
        "estimate_duration_ms",
        lambda payload, sentences: 999999,
    )
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "hello world", "begin_ms": 0, "end_ms": 1000}],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("hello", 0, 500), _word_entry("world", 500, 1000)],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 500)]}]}, "usage_seconds": 60},
    )

    source_path = tmp_path / "usage.mp4"
    req_dir = tmp_path / "req_usage"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "usage-settle@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 1000
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="usage.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )
        session.refresh(account)
        assert lesson.id > 0
        assert account.balance_points == 870

        ledgers = (
            session.query(WalletLedger)
            .filter(WalletLedger.user_id == user.id)
            .order_by(WalletLedger.id.asc())
            .all()
        )
        assert [item.event_type for item in ledgers[-3:]] == ["reserve", "refund", "consume"]
        assert ledgers[-2].delta_points == 130
        assert ledgers[-1].delta_points == 0
    finally:
        session.close()


def test_generate_lesson_settles_with_fallback_and_can_go_negative(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="fallback-settle@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts)),
    )
    monkeypatch.setattr(
        lesson_service_module,
        "estimate_duration_ms",
        lambda payload, sentences: 300000,
    )
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "hello world", "begin_ms": 0, "end_ms": 1000}],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("hello", 0, 500), _word_entry("world", 500, 1000)],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 500)]}]}, "usage_seconds": None},
    )

    source_path = tmp_path / "fallback.mp4"
    req_dir = tmp_path / "req_fallback"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "fallback-settle@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 400
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="fallback.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )
        session.refresh(account)
        assert lesson.id > 0
        assert account.balance_points == -250

        ledgers = (
            session.query(WalletLedger)
            .filter(WalletLedger.user_id == user.id)
            .order_by(WalletLedger.id.asc())
            .all()
        )
        assert [item.event_type for item in ledgers[-3:]] == ["reserve", "consume", "consume"]
        assert ledgers[-2].delta_points == -390
        assert ledgers[-1].delta_points == 0
    finally:
        session.close()


def test_generate_lesson_self_heals_legacy_subtitle_settings_columns(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="legacy-subtitle@example.com")

    _recreate_legacy_subtitle_settings(session_factory)

    from app.services import lesson_service as lesson_service_module

    asr_payload = {
        "transcripts": [
            {
                "sentences": [{"text": "Hello world", "begin_time": 0, "end_time": 1000}],
                "words": [_word_entry("Hello", 0, 500), _word_entry("world", 500, 1000)],
            }
        ]
    }

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 1000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts), total_tokens=12),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 1000)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": asr_payload, "usage_seconds": 1},
    )

    source_path = tmp_path / "legacy_subtitle.mp4"
    req_dir = tmp_path / "req_legacy_subtitle"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "legacy-subtitle@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="legacy_subtitle.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )

        session.refresh(account)
        repaired_settings = get_subtitle_settings(session)
        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()

        assert lesson.id > 0
        assert stored[0].text_en == "Hello world"
        assert stored[0].text_zh == "你好"
        assert int(repaired_settings.semantic_split_timeout_seconds) == 40
        assert int(repaired_settings.translation_batch_max_chars) == 2600
    finally:
        session.close()


def test_generate_lesson_stores_spoken_usd_amounts(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="spoken-money@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 1000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["40美元？"] * len(texts)),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 1000)
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "$40?", "begin_ms": 0, "end_ms": 1000}],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("$40", 0, 1000, punctuation="?", surface="$40?")],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("$40", 0, 1000, punctuation="?")]}]}, "usage_seconds": 1},
    )

    source_path = tmp_path / "spoken_money.mp4"
    req_dir = tmp_path / "req_spoken_money"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "spoken-money@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 100
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="spoken_money.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert len(stored) == 1
        assert stored[0].text_en == "forty dollars?"
        assert stored[0].tokens_json == ["forty", "dollars"]
    finally:
        session.close()


def test_generate_lesson_applies_semantic_split_when_enabled(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-ok@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import get_or_create_wallet_account, get_subtitle_settings

    word_chunk = [
        {"text": "alpha", "surface": "alpha", "punctuation": "", "begin_ms": 0, "end_ms": 500},
        {"text": "beta", "surface": "beta", "punctuation": "", "begin_ms": 500, "end_ms": 1000},
        {"text": "gamma", "surface": "gamma", "punctuation": "", "begin_ms": 1000, "end_ms": 1500},
        {"text": "delta", "surface": "delta", "punctuation": "", "begin_ms": 1500, "end_ms": 2000},
        {"text": "epsilon", "surface": "epsilon", "punctuation": "", "begin_ms": 2000, "end_ms": 2500},
        {"text": "zeta", "surface": "zeta", "punctuation": "", "begin_ms": 2500, "end_ms": 3000},
    ]

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{item}" for item in texts]),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 3000)
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "alpha beta gamma delta epsilon zeta", "begin_ms": 0, "end_ms": 3000}],
            "chunks": [word_chunk],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("alpha", 0, 500), _word_entry("zeta", 2500, 3000)],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "split_sentence_by_semantic",
        lambda text, **kwargs: ["alpha beta gamma", "delta epsilon zeta"],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("alpha", 0, 500)]}]}, "usage_seconds": None},
    )

    source_path = tmp_path / "semantic_ok.mp4"
    req_dir = tmp_path / "req_semantic_ok"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "semantic-ok@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        settings = get_subtitle_settings(session)
        settings.semantic_split_max_words_threshold = 3
        session.add_all([account, settings])
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="semantic_ok.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            semantic_split_enabled=True,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert [item.text_en for item in stored] == ["alpha beta gamma", "delta epsilon zeta"]
        assert [item.begin_ms for item in stored] == [0, 1500]
        assert [item.end_ms for item in stored] == [1500, 3000]
    finally:
        session.close()


def test_generate_lesson_uses_asr_sentences_when_semantic_disabled(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-disabled@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import get_or_create_wallet_account

    asr_payload = {
        "transcripts": [
            {
                "sentences": [
                    {"text": "Alpha beta", "begin_time": 0, "end_time": 1200},
                    {"text": "Gamma delta", "begin_time": 1200, "end_time": 2600},
                ],
                "words": [
                    _word_entry("Alpha", 0, 500),
                    _word_entry("beta", 500, 1200),
                    _word_entry("Gamma", 1200, 1800),
                    _word_entry("delta", 1800, 2600),
                ],
            }
        ]
    }

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{item}" for item in texts]),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 2600)

    def _unexpected_rule_split(*args, **kwargs):
        raise AssertionError("semantic_split_enabled=False should not call build_lesson_sentences")

    monkeypatch.setattr(lesson_service_module, "build_lesson_sentences", _unexpected_rule_split)
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [
            _word_entry("Alpha", 0, 500),
            _word_entry("beta", 500, 1200),
            _word_entry("Gamma", 1200, 1800),
            _word_entry("delta", 1800, 2600),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": asr_payload, "usage_seconds": None},
    )

    source_path = tmp_path / "semantic_disabled.mp4"
    req_dir = tmp_path / "req_semantic_disabled"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "semantic-disabled@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="semantic_disabled.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            semantic_split_enabled=False,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert [item.text_en for item in stored] == ["Alpha beta", "Gamma delta"]
        assert [item.begin_ms for item in stored] == [0, 1200]
        assert [item.end_ms for item in stored] == [1200, 2600]
        assert lesson.subtitle_cache_seed["semantic_split_enabled"] is False
        assert lesson.subtitle_cache_seed["split_mode"] == "asr_sentences"
        assert lesson.subtitle_cache_seed["strategy_version"] == 2
    finally:
        session.close()


def test_generate_lesson_semantic_split_failure_falls_back_to_rule_split(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="semantic-fallback@example.com")

    from app.services import lesson_service as lesson_service_module
    from app.services.billing_service import get_or_create_wallet_account, get_subtitle_settings
    from app.services.translation_qwen_mt import SemanticSplitError

    word_chunk = [
        {"text": "alpha", "surface": "alpha", "punctuation": "", "begin_ms": 0, "end_ms": 500},
        {"text": "beta", "surface": "beta", "punctuation": "", "begin_ms": 500, "end_ms": 1000},
        {"text": "gamma", "surface": "gamma", "punctuation": "", "begin_ms": 1000, "end_ms": 1500},
        {"text": "delta", "surface": "delta", "punctuation": "", "begin_ms": 1500, "end_ms": 2000},
    ]

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{item}" for item in texts]),
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 2000)
    monkeypatch.setattr(
        lesson_service_module,
        "build_lesson_sentences",
        lambda payload, **kwargs: {
            "sentences": [{"text": "alpha beta gamma delta", "begin_ms": 0, "end_ms": 2000}],
            "chunks": [word_chunk],
            "mode": "word_level_split",
        },
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_word_items",
        lambda payload: [_word_entry("alpha", 0, 500), _word_entry("delta", 1500, 2000)],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "split_sentence_by_semantic",
        lambda text, **kwargs: (_ for _ in ()).throw(SemanticSplitError("boom")),
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"words": [_word_entry("alpha", 0, 500)]}]}, "usage_seconds": None},
    )

    source_path = tmp_path / "semantic_fallback.mp4"
    req_dir = tmp_path / "req_semantic_fallback"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "semantic-fallback@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        settings = get_subtitle_settings(session)
        settings.semantic_split_max_words_threshold = 3
        session.add_all([account, settings])
        session.commit()

        lesson = lesson_service_module.LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="semantic_fallback.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            semantic_split_enabled=True,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        assert len(stored) == 1
        assert stored[0].text_en == "alpha beta gamma delta"
    finally:
        session.close()


def test_generate_lesson_failure_still_refunds_reserved_points(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="settle-fail@example.com")

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "extract_audio_for_asr",
        lambda source_path, opus_path: opus_path.write_bytes(b"opus"),
    )
    monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda opus_path: 120000)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("asr failed")),
    )

    source_path = tmp_path / "fail.mp4"
    req_dir = tmp_path / "req_fail"
    source_path.write_bytes(b"source")
    req_dir.mkdir(parents=True, exist_ok=True)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "settle-fail@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        with pytest.raises(RuntimeError):
            lesson_service_module.LessonService.generate_from_saved_file(
                source_path=source_path,
                source_filename="fail.mp4",
                req_dir=req_dir,
                owner_id=user.id,
                asr_model=QWEN_ASR_MODEL,
                db=session,
            )

        session.refresh(account)
        assert account.balance_points == 500
        ledgers = (
            session.query(WalletLedger)
            .filter(WalletLedger.user_id == user.id)
            .order_by(WalletLedger.id.asc())
            .all()
        )
        assert [item.event_type for item in ledgers[-2:]] == ["reserve", "refund"]
        assert ledgers[-2].delta_points == -260
        assert ledgers[-1].delta_points == 260
    finally:
        session.close()






