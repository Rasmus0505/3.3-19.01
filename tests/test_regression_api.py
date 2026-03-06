from __future__ import annotations

import io
import os
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import Lesson, LessonProgress, LessonSentence, MediaAsset, User, WalletLedger
from app.services.billing_service import ensure_default_billing_rates, get_or_create_wallet_account, settle_reserved_points

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"


@pytest.fixture()
def test_client(tmp_path, monkeypatch):
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


def test_health_ready_endpoint(test_client):
    client, _, _ = test_client
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["status"]["db_ready"] is True


def test_startup_without_dashscope_key_keeps_health_alive(monkeypatch, tmp_path):
    from app import main as app_main

    tmp_base = tmp_path / "startup"
    monkeypatch.setattr(app_main, "BASE_TMP_DIR", tmp_base)
    monkeypatch.setattr(app_main, "BASE_DATA_DIR", tmp_base / "data")
    monkeypatch.setattr(app_main, "DASHSCOPE_API_KEY", "")
    monkeypatch.setattr(app_main, "_refresh_optional_runtime_status", lambda _app: None)

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
    assert payload["status"]["db_error"] == "db offline"


def test_transcribe_audio_requires_dashscope_api_key(monkeypatch, tmp_path):
    from app.infra import asr_dashscope

    audio_file = tmp_path / "sample.opus"
    audio_file.write_bytes(b"dummy")
    monkeypatch.setattr(asr_dashscope.dashscope, "api_key", "", raising=False)
    with pytest.raises(asr_dashscope.AsrError) as exc:
        asr_dashscope.transcribe_audio_file(str(audio_file), model=asr_dashscope.DEFAULT_MODEL)
    assert exc.value.code == "ASR_API_KEY_MISSING"


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
    assert data["detail"]["supported_models"] == [QWEN_ASR_MODEL]


def test_auth_register_and_login(test_client):
    client, _, _ = test_client
    token = _register_and_login(client, email="user1@example.com")
    assert token


def test_wallet_and_admin_endpoints(test_client):
    client, _, monkeypatch = test_client
    token = _register_and_login(client, email="admin@example.com")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")

    headers = {"Authorization": f"Bearer {token}"}

    wallet = client.get("/api/wallet/me", headers=headers)
    assert wallet.status_code == 200
    assert "balance_points" in wallet.json()

    rates = client.get("/api/admin/billing-rates", headers=headers)
    assert rates.status_code == 200
    assert isinstance(rates.json().get("rates"), list)

    users = client.get("/api/admin/users", headers=headers)
    assert users.status_code == 200
    assert "items" in users.json()

    logs = client.get("/api/admin/wallet-logs", headers=headers)
    assert logs.status_code == 200
    assert "items" in logs.json()


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

    def fake_generate(upload_file, req_dir, owner_id, asr_model, db):
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
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_upload", fake_generate)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    data = {"asr_model": QWEN_ASR_MODEL}
    resp = client.post("/api/lessons", headers=headers, files=files, data=data)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson"]["title"] == "fake lesson"
    assert body["lesson"]["media_storage"] == "client_indexeddb"
    assert body["lesson"]["source_duration_ms"] == 1234
    assert body["lesson"]["sentences"][0]["audio_url"] is None


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

    def fake_generate_from_saved_file(*, source_path, source_filename, req_dir, owner_id, asr_model, db, progress_callback=None):
        if progress_callback:
            progress_callback({"stage_key": "convert_audio", "stage_status": "completed", "overall_percent": 20, "current_text": "转换音频格式完成"})
            progress_callback({"stage_key": "asr_transcribe", "stage_status": "completed", "overall_percent": 60, "current_text": "转写字幕 3/约3", "counters": {"asr_done": 3, "asr_estimated": 3}})
            progress_callback({"stage_key": "translate_zh", "stage_status": "completed", "overall_percent": 90, "current_text": "翻译字幕 3/3", "counters": {"translate_done": 3, "translate_total": 3}})
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
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_saved_file", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        files={"video_file": ("task.mp4", io.BytesIO(b"dummy"), "video/mp4")},
        data={"asr_model": QWEN_ASR_MODEL},
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "succeeded"
    assert payload["overall_percent"] == 100
    assert payload["lesson"]["title"] == "task lesson"
    assert payload["counters"]["translate_done"] == 3
    assert all(item["status"] == "completed" for item in payload["stages"])


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
        segment_seconds=2,
        max_concurrency=4,
        progress_callback=None,
    )
    payload_single = result_single["asr_payload"]
    assert single_calls["count"] == 1
    assert payload_single["transcripts"][0]["sentences"][0]["text"] == "single"

    monkeypatch.setattr(
        lesson_service_module,
        "_split_audio_segments",
        lambda source_audio, segments_dir, segment_seconds, duration_ms: [
            (0, 0, tmp_path / "seg0.opus"),
            (1, 5000, tmp_path / "seg1.opus"),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "_transcribe_segment",
        lambda segment_index, segment_start_ms, segment_path, asr_model: (
            segment_index,
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
        segment_seconds=5,
        max_concurrency=4,
        progress_callback=None,
    )
    payload_parallel = result_parallel["asr_payload"]
    sentences = payload_parallel["transcripts"][0]["sentences"]
    assert len(sentences) == 2
    assert sentences[0]["text"] == "seg-0"
    assert sentences[1]["text"] == "seg-1"


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
        lambda texts, api_key, progress_callback=None: (["你好"] * len(texts), 0),
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_sentences",
        lambda payload: [{"text": "hello world", "begin_ms": 0, "end_ms": 1000}],
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 999999)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": [{"text": "hello world"}]}]}, "usage_seconds": 60},
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
        lambda texts, api_key, progress_callback=None: (["你好"] * len(texts), 0),
    )
    monkeypatch.setattr(
        lesson_service_module,
        "extract_sentences",
        lambda payload: [{"text": "hello world", "begin_ms": 0, "end_ms": 1000}],
    )
    monkeypatch.setattr(lesson_service_module, "estimate_duration_ms", lambda payload, sentences: 300000)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_transcribe_with_optional_parallel",
        lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": [{"text": "hello world"}]}]}, "usage_seconds": None},
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

