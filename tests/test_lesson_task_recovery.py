from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import LessonGenerationTask, User
from app.services import lesson_command_service
from app.services.billing_service import ensure_default_billing_rates
from app.services.lesson_task_manager import configure_task_runtime_probe, create_task, update_task_progress
from app.services.query_cache import clear_query_caches
from app.core.timezone import now_shanghai_naive


ORPHANED_TASK_MESSAGE = "上次生成已中断，可继续生成或重新开始。"


def _register_and_login(client: TestClient, *, email: str, password: str = "123456") -> str:
    register_resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert register_resp.status_code == 200
    admin_emails = {item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
    session_factory = getattr(client.app.state, "testing_session_factory", None)
    if session_factory is not None and email.lower() in admin_emails:
        session = session_factory()
        try:
            user = session.scalar(select(User).where(User.email == email.lower()))
            assert user is not None
            user.is_admin = True
            session.add(user)
            session.commit()
        finally:
            session.close()
    login_resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    return login_resp.json()["access_token"]


def _get_user_id(session_factory, *, email: str) -> int:
    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        return int(user.id)
    finally:
        session.close()


def _create_stale_running_task(session_factory, *, tmp_path: Path, owner_user_id: int, create_artifacts: bool = True) -> str:
    req_dir = tmp_path / f"task-{owner_user_id}-{int(now_shanghai_naive().timestamp())}"
    source_path = req_dir / "source.mp4"
    if create_artifacts:
        req_dir.mkdir(parents=True, exist_ok=True)
        source_path.write_bytes(b"video")

    task_id = f"lesson_task_recovery_{owner_user_id}_{'ready' if create_artifacts else 'missing'}"
    session = session_factory()
    try:
        create_task(
            task_id=task_id,
            owner_user_id=owner_user_id,
            source_filename="source.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            semantic_split_enabled=False,
            work_dir=str(req_dir),
            source_path=str(source_path),
            db=session,
        )
        update_task_progress(
            task_id,
            stage_key="translate_zh",
            stage_status="running",
            overall_percent=72,
            current_text="翻译中",
            counters={"translate_done": 3, "translate_total": 8},
            db=session,
        )
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task is not None
        task.stages_json = [
            {"key": "convert_audio", "label": "转换音频格式", "status": "completed"},
            {"key": "asr_transcribe", "label": "ASR转写字幕", "status": "completed"},
            {"key": "translate_zh", "label": "翻译中文", "status": "running"},
            {"key": "write_lesson", "label": "写入课程", "status": "pending"},
        ]
        task.resume_stage = "translate_zh"
        task.updated_at = now_shanghai_naive() - timedelta(minutes=10)
        session.commit()
        return task_id
    finally:
        session.close()


@pytest.fixture()
def test_client(tmp_path):
    clear_query_caches()
    db_file = tmp_path / "test_app.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    Base.metadata.create_all(bind=engine)

    seed = testing_session_local()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    app = create_app(enable_lifespan=False)
    app.state.testing_session_factory = testing_session_local

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, testing_session_local, tmp_path
    finally:
        configure_task_runtime_probe(
            lesson_command_service.is_task_active_in_current_process,
            process_started_at=lesson_command_service.PROCESS_STARTED_AT,
        )
        clear_query_caches()


def test_orphaned_running_task_is_reconciled_on_first_get(test_client):
    client, session_factory, tmp_path = test_client
    token = _register_and_login(client, email="recovery-get@example.com")
    user_id = _get_user_id(session_factory, email="recovery-get@example.com")
    task_id = _create_stale_running_task(session_factory, tmp_path=tmp_path, owner_user_id=user_id)

    configure_task_runtime_probe(lambda _: False, process_started_at=now_shanghai_naive())

    response = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "paused"
    assert payload["resume_available"] is True
    assert payload["current_text"] == ORPHANED_TASK_MESSAGE
    assert payload["can_pause"] is False
    assert payload["can_terminate"] is False


def test_reconciled_task_resume_reuses_safe_point(test_client, monkeypatch):
    client, session_factory, tmp_path = test_client
    token = _register_and_login(client, email="recovery-resume@example.com")
    user_id = _get_user_id(session_factory, email="recovery-resume@example.com")
    task_id = _create_stale_running_task(session_factory, tmp_path=tmp_path, owner_user_id=user_id)
    configure_task_runtime_probe(lambda _: False, process_started_at=now_shanghai_naive())

    started_runs: list[dict] = []

    class DummyThread:
        def __init__(self, *, target=None, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = dict(kwargs or {})
            self.daemon = daemon

        def start(self):
            started_runs.append(dict(self._kwargs))

    monkeypatch.setattr(lesson_command_service.threading, "Thread", DummyThread)

    response = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert started_runs and started_runs[0]["task_id"] == task_id

    session = session_factory()
    try:
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task is not None
        assert task.status == "pending"
        assert task.resume_available is False
        assert task.resume_stage == "translate_zh"
        assert task.current_text == "准备继续生成"
    finally:
        session.close()


def test_reconciled_task_resume_reports_missing_artifacts(test_client):
    client, session_factory, tmp_path = test_client
    token = _register_and_login(client, email="recovery-missing@example.com")
    user_id = _get_user_id(session_factory, email="recovery-missing@example.com")
    task_id = _create_stale_running_task(session_factory, tmp_path=tmp_path, owner_user_id=user_id, create_artifacts=False)
    configure_task_runtime_probe(lambda _: False, process_started_at=now_shanghai_naive())

    response = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 400
    payload = response.json()
    assert payload["error_code"] == "TASK_ARTIFACT_MISSING"

    task_response = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert task_response.status_code == 200
    task_payload = task_response.json()
    assert task_payload["status"] == "failed"
    assert task_payload["resume_available"] is False


def test_active_task_probe_prevents_orphan_recovery(test_client):
    client, session_factory, tmp_path = test_client
    token = _register_and_login(client, email="recovery-live@example.com")
    user_id = _get_user_id(session_factory, email="recovery-live@example.com")
    task_id = _create_stale_running_task(session_factory, tmp_path=tmp_path, owner_user_id=user_id)

    configure_task_runtime_probe(lambda active_task_id: active_task_id == task_id, process_started_at=now_shanghai_naive())

    response = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "running"
    assert payload["current_text"] == "翻译中"
    assert payload["resume_available"] is False
