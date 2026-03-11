from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, text

from app.models import Lesson, LessonGenerationTask, TranslationRequestLog, User
from app.services.lesson_task_manager import create_task, mark_task_failed
from test_regression_api import _register_and_login, test_client


def test_admin_overview_returns_metrics_and_recent_rows(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-overview@example.com")

    admin_token = _register_and_login(client, email="admin-overview@example.com")
    user_token = _register_and_login(client, email="overview-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    create_batch = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "overview_batch",
            "face_value_points": 88,
            "generate_quantity": 2,
            "active_from": "2026-03-09T10:00:00+08:00",
            "expire_at": "2026-04-09T10:00:00+08:00",
            "remark": "overview",
        },
    )
    assert create_batch.status_code == 200
    code = create_batch.json()["generated_codes"][0]

    redeem = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": code})
    assert redeem.status_code == 200

    overview = client.get("/api/admin/overview", headers=admin_headers)
    assert overview.status_code == 200
    data = overview.json()

    assert data["ok"] is True
    assert data["metrics"]["today_new_users"] >= 2
    assert data["metrics"]["today_redeem_points"] >= 88
    assert data["metrics"]["active_batches"] >= 1
    assert len(data["recent_batches"]) >= 1
    assert any(item["action_type"] == "redeem_batch_create" for item in data["recent_operations"])


def test_admin_operation_logs_and_user_summary(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-console@example.com")

    admin_token = _register_and_login(client, email="admin-console@example.com")
    user_token = _register_and_login(client, email="console-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    create_batch = client.post(
        "/api/admin/redeem-batches",
        headers=admin_headers,
        json={
            "batch_name": "console_batch",
            "face_value_points": 66,
            "generate_quantity": 1,
            "active_from": "2026-03-09T10:00:00+08:00",
            "expire_at": "2026-04-09T10:00:00+08:00",
            "remark": "console",
        },
    )
    assert create_batch.status_code == 200
    batch_id = create_batch.json()["batch"]["id"]
    code = create_batch.json()["generated_codes"][0]

    pause_batch = client.post(f"/api/admin/redeem-batches/{batch_id}/pause", headers=admin_headers)
    assert pause_batch.status_code == 200

    redeem_fail = client.post("/api/wallet/redeem-code", headers=user_headers, json={"code": code})
    assert redeem_fail.status_code == 400

    learner_id = None
    session = session_factory()
    try:
        learner = session.scalar(select(User).where(User.email == "console-user@example.com"))
        assert learner is not None
        learner_id = learner.id
        lesson = Lesson(
            user_id=learner.id,
            title="Console Lesson",
            source_filename="console.mp3",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=1200,
            source_duration_ms=1200,
            status="ready",
            created_at=datetime(2026, 3, 9, 12, 0, 0),
        )
        session.add(lesson)
        session.commit()
    finally:
        session.close()

    operation_logs = client.get(
        "/api/admin/operation-logs",
        headers=admin_headers,
        params={"action_type": "redeem_batch_status_update"},
    )
    assert operation_logs.status_code == 200
    operation_data = operation_logs.json()
    assert operation_data["total"] >= 1
    assert any(item["action_type"] == "redeem_batch_status_update" for item in operation_data["items"])

    summary = client.get(f"/api/admin/users/{learner_id}/summary", headers=admin_headers)
    assert summary.status_code == 200
    summary_data = summary.json()["summary"]
    assert summary_data["lesson_count"] == 1
    assert summary_data["latest_lesson_created_at"] is not None
    assert summary_data["latest_wallet_event_at"] is None or isinstance(summary_data["latest_wallet_event_at"], str)


def test_admin_lesson_task_logs_exposes_traceback_excerpt(test_client, tmp_path):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-task-log@example.com")

    admin_token = _register_and_login(client, email="admin-task-log@example.com")
    _register_and_login(client, email="task-log-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    task_id = "lesson_task_admin_traceback_case"
    work_dir = tmp_path / "task-log-artifacts"
    work_dir.mkdir(parents=True, exist_ok=True)
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"video")

    session = session_factory()
    try:
        learner = session.scalar(select(User).where(User.email == "task-log-user@example.com"))
        assert learner is not None
        create_task(
            task_id=task_id,
            owner_user_id=learner.id,
            source_filename="traceback.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            semantic_split_enabled=False,
            work_dir=str(work_dir),
            source_path=str(source_path),
            db=session,
        )
        mark_task_failed(
            task_id,
            error_code="INTERNAL_ERROR",
            message="课程生成失败",
            exception_type="RuntimeError",
            detail_excerpt="unit failure detail",
            traceback_excerpt="Traceback (most recent call last):\n  File \"x.py\", line 1, in <module>\nRuntimeError: unit failure",
            resume_available=False,
            db=session,
        )
    finally:
        session.close()

    logs = client.get("/api/admin/lesson-task-logs", headers=admin_headers, params={"task_id": task_id})
    assert logs.status_code == 200
    payload = logs.json()
    assert payload["total"] >= 1
    item = next((row for row in payload["items"] if row["task_id"] == task_id), None)
    assert item is not None
    assert item["exception_type"] == "RuntimeError"
    assert "unit failure detail" in item["detail_excerpt"]
    assert "Traceback" in item["traceback_excerpt"]
    assert "traceback_excerpt" in item["failure_debug"]
    assert "RuntimeError: unit failure" in item["failure_debug"]["traceback_excerpt"]


def test_admin_lesson_task_log_detail_exposes_raw_debug_payloads(test_client, tmp_path):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-task-detail@example.com")

    admin_token = _register_and_login(client, email="admin-task-detail@example.com")
    _register_and_login(client, email="task-detail-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    task_id = "lesson_task_admin_detail_raw_case"
    work_dir = tmp_path / "task-detail-artifacts"
    work_dir.mkdir(parents=True, exist_ok=True)
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"video")

    session = session_factory()
    try:
        learner = session.scalar(select(User).where(User.email == "task-detail-user@example.com"))
        assert learner is not None
        create_task(
            task_id=task_id,
            owner_user_id=learner.id,
            source_filename="detail.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            semantic_split_enabled=False,
            work_dir=str(work_dir),
            source_path=str(source_path),
            db=session,
        )
        task_row = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        task_row.asr_raw_json = {
            "model": "qwen3-asr-flash-filetrans",
            "task_id": "dashscope_asr_001",
            "task_status": "SUCCEEDED",
            "usage_seconds": 12,
            "transcription_url": "https://example.com/asr.json",
            "preview_text": "hello world",
            "asr_result_json": {"transcripts": [{"text": "hello world"}]},
        }
        mark_task_failed(
            task_id,
            error_code="INTERNAL_ERROR",
            message="课程生成失败",
            exception_type="RuntimeError",
            detail_excerpt="unit failure detail",
            traceback_excerpt="Traceback (most recent call last):\nRuntimeError: unit failure",
            resume_available=False,
            db=session,
        )
        session.add(
            TranslationRequestLog(
                trace_id="trace_raw_case",
                task_id=task_id,
                user_id=learner.id,
                sentence_idx=0,
                attempt_no=1,
                provider="dashscope_compatible",
                model_name="qwen-mt-flash",
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                input_text_preview="hello world",
                provider_request_id="req_raw_case",
                status_code=429,
                finish_reason=None,
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
                success=False,
                error_code="RATE_LIMIT",
                error_message="rate limited",
                raw_request_text='{"model":"qwen-mt-flash","messages":[{"role":"user","content":"hello world"}]}',
                raw_response_text='{"id":"resp_001","choices":[]}',
                raw_error_text='{"status_code":429,"body":{"error":{"message":"rate limited"}}}',
                started_at=datetime(2026, 3, 11, 16, 0, 0),
                finished_at=datetime(2026, 3, 11, 16, 0, 1),
                created_at=datetime(2026, 3, 11, 16, 0, 1),
            )
        )
        session.commit()
    finally:
        session.close()

    resp = client.get(f"/api/admin/lesson-task-logs/{task_id}", headers=admin_headers)
    assert resp.status_code == 200
    payload = resp.json()["item"]
    assert payload["task_id"] == task_id
    assert payload["has_raw_debug"] is True
    assert payload["asr_raw"]["task_id"] == "dashscope_asr_001"
    assert payload["failure_debug"]["traceback_excerpt"].startswith("Traceback")
    assert len(payload["translation_attempts"]) == 1
    attempt = payload["translation_attempts"][0]
    assert '"content":"hello world"' in attempt["raw_request_text"]
    assert '"choices":[]' in attempt["raw_response_text"]
    assert '"status_code":429' in attempt["raw_error_text"]


def test_admin_lesson_task_log_detail_raw_debug_delete_preserves_summary(test_client, tmp_path):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-task-delete@example.com")

    admin_token = _register_and_login(client, email="admin-task-delete@example.com")
    _register_and_login(client, email="task-delete-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    task_id = "lesson_task_admin_delete_raw_case"
    work_dir = tmp_path / "task-delete-artifacts"
    work_dir.mkdir(parents=True, exist_ok=True)
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"video")

    session = session_factory()
    try:
        learner = session.scalar(select(User).where(User.email == "task-delete-user@example.com"))
        assert learner is not None
        create_task(
            task_id=task_id,
            owner_user_id=learner.id,
            source_filename="delete.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            semantic_split_enabled=False,
            work_dir=str(work_dir),
            source_path=str(source_path),
            db=session,
        )
        task_row = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        task_row.asr_raw_json = {"task_id": "raw_to_delete"}
        mark_task_failed(
            task_id,
            error_code="INTERNAL_ERROR",
            message="课程生成失败",
            exception_type="RuntimeError",
            detail_excerpt="delete raw detail",
            traceback_excerpt="Traceback (most recent call last):\nRuntimeError: delete raw",
            resume_available=False,
            db=session,
        )
        session.add(
            TranslationRequestLog(
                trace_id="trace_delete_case",
                task_id=task_id,
                user_id=learner.id,
                sentence_idx=0,
                attempt_no=1,
                provider="dashscope_compatible",
                model_name="qwen-mt-flash",
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                input_text_preview="delete me",
                provider_request_id="req_delete_case",
                status_code=500,
                finish_reason=None,
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
                success=False,
                error_code="REQUEST_FAILED",
                error_message="server error",
                raw_request_text='{"delete":"request"}',
                raw_response_text='{"delete":"response"}',
                raw_error_text='{"delete":"error"}',
                started_at=datetime(2026, 3, 11, 16, 5, 0),
                finished_at=datetime(2026, 3, 11, 16, 5, 1),
                created_at=datetime(2026, 3, 11, 16, 5, 1),
            )
        )
        session.commit()
    finally:
        session.close()

    delete_resp = client.delete(f"/api/admin/lesson-task-logs/{task_id}/raw", headers=admin_headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True
    assert delete_resp.json()["raw_debug_purged_at"]

    detail_resp = client.get(f"/api/admin/lesson-task-logs/{task_id}", headers=admin_headers)
    assert detail_resp.status_code == 200
    item = detail_resp.json()["item"]
    assert item["has_raw_debug"] is False
    assert item["raw_debug_purged_at"] is not None
    assert item["asr_raw"] is None
    assert item["failure_debug"]["detail_excerpt"] == "delete raw detail"
    assert item["translation_attempts"][0]["raw_request_text"] == ""
    assert item["translation_attempts"][0]["raw_response_text"] == ""
    assert item["translation_attempts"][0]["raw_error_text"] == ""


def test_admin_lesson_task_log_detail_requires_admin(test_client, tmp_path):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-task-protected@example.com")

    _register_and_login(client, email="admin-task-protected@example.com")
    user_token = _register_and_login(client, email="task-protected-user@example.com")
    user_headers = {"Authorization": f"Bearer {user_token}"}

    task_id = "lesson_task_admin_protected_case"
    work_dir = tmp_path / "task-protected-artifacts"
    work_dir.mkdir(parents=True, exist_ok=True)
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"video")

    session = session_factory()
    try:
        learner = session.scalar(select(User).where(User.email == "task-protected-user@example.com"))
        assert learner is not None
        create_task(
            task_id=task_id,
            owner_user_id=learner.id,
            source_filename="protected.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            semantic_split_enabled=False,
            work_dir=str(work_dir),
            source_path=str(source_path),
            db=session,
        )
    finally:
        session.close()

    detail_resp = client.get(f"/api/admin/lesson-task-logs/{task_id}", headers=user_headers)
    assert detail_resp.status_code == 403

    delete_resp = client.delete(f"/api/admin/lesson-task-logs/{task_id}/raw", headers=user_headers)
    assert delete_resp.status_code == 403


def test_admin_lesson_task_logs_accepts_empty_lesson_id_and_rejects_invalid(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-lesson-id@example.com")
    admin_token = _register_and_login(client, email="admin-lesson-id@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    empty_resp = client.get("/api/admin/lesson-task-logs", headers=admin_headers, params={"lesson_id": ""})
    assert empty_resp.status_code == 200
    assert empty_resp.json()["ok"] is True

    invalid_resp = client.get("/api/admin/lesson-task-logs", headers=admin_headers, params={"lesson_id": "abc"})
    assert invalid_resp.status_code == 400
    assert invalid_resp.json()["error_code"] == "INVALID_LESSON_ID"


def test_admin_lesson_task_logs_returns_503_when_task_table_missing(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "admin-lesson-task-migration@example.com")
    admin_token = _register_and_login(client, email="admin-lesson-task-migration@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    session = session_factory()
    try:
        session.execute(text("DROP TABLE lesson_generation_tasks"))
        session.commit()
    finally:
        session.close()

    resp = client.get("/api/admin/lesson-task-logs", headers=admin_headers)
    assert resp.status_code == 503
    payload = resp.json()
    assert payload["error_code"] == "DB_MIGRATION_REQUIRED"
    assert "lesson_generation_tasks" in str(payload.get("detail", ""))


def test_admin_overview_and_user_summary_cache_hit_and_ttl_expire(test_client):
    client, session_factory, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "cache-admin@example.com")

    admin_token = _register_and_login(client, email="cache-admin@example.com")
    user_token = _register_and_login(client, email="cache-user@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == "cache-user@example.com"))
        assert user is not None
        lesson = Lesson(
            user_id=user.id,
            title="Cache Lesson",
            source_filename="cache.mp3",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=1000,
            source_duration_ms=1000,
            status="ready",
            created_at=datetime(2026, 3, 11, 10, 0, 0),
        )
        session.add(lesson)
        session.commit()
        learner_id = user.id
    finally:
        session.close()

    import app.repositories.admin_console as admin_console_repo

    monkeypatch.setattr(admin_console_repo, "ADMIN_OVERVIEW_TTL_SECONDS", 1)
    monkeypatch.setattr(admin_console_repo, "ADMIN_USER_SUMMARY_TTL_SECONDS", 1)

    overview_calls = 0
    summary_calls = 0
    original_overview = admin_console_repo._get_admin_overview_data_uncached
    original_summary = admin_console_repo._get_admin_user_activity_summary_uncached

    def counted_overview(*args, **kwargs):
        nonlocal overview_calls
        overview_calls += 1
        return original_overview(*args, **kwargs)

    def counted_summary(*args, **kwargs):
        nonlocal summary_calls
        summary_calls += 1
        return original_summary(*args, **kwargs)

    monkeypatch.setattr(admin_console_repo, "_get_admin_overview_data_uncached", counted_overview)
    monkeypatch.setattr(admin_console_repo, "_get_admin_user_activity_summary_uncached", counted_summary)

    first_overview = client.get("/api/admin/overview", headers=admin_headers)
    second_overview = client.get("/api/admin/overview", headers=admin_headers)
    assert first_overview.status_code == 200
    assert second_overview.status_code == 200
    assert overview_calls == 1

    first_summary = client.get(f"/api/admin/users/{learner_id}/summary", headers=admin_headers)
    second_summary = client.get(f"/api/admin/users/{learner_id}/summary", headers=admin_headers)
    assert first_summary.status_code == 200
    assert second_summary.status_code == 200
    assert summary_calls == 1

    time.sleep(1.1)

    third_overview = client.get("/api/admin/overview", headers=admin_headers)
    third_summary = client.get(f"/api/admin/users/{learner_id}/summary", headers=admin_headers)
    assert third_overview.status_code == 200
    assert third_summary.status_code == 200
    assert overview_calls == 2
    assert summary_calls == 2


def test_create_lesson_task_returns_503_when_task_table_missing(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="lesson-task-migration-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        session.execute(text("DROP TABLE lesson_generation_tasks"))
        session.commit()
    finally:
        session.close()

    resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        files={"video_file": ("migration.mp4", b"video", "video/mp4")},
        data={"asr_model": "qwen3-asr-flash-filetrans", "semantic_split_enabled": "false"},
    )
    assert resp.status_code == 503
    payload = resp.json()
    assert payload["error_code"] == "DB_MIGRATION_REQUIRED"
    assert "lesson_generation_tasks" in str(payload.get("detail", ""))


def test_admin_subtitle_settings_history_and_rollback(test_client):
    client, _, monkeypatch = test_client
    monkeypatch.setenv("ADMIN_EMAILS", "subtitle-history-admin@example.com")

    admin_token = _register_and_login(client, email="subtitle-history-admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    initial = client.get("/api/admin/subtitle-settings/history", headers=admin_headers)
    assert initial.status_code == 200
    initial_settings = initial.json()["current"]

    update_resp = client.put(
        "/api/admin/subtitle-settings",
        headers=admin_headers,
        json={
            "semantic_split_default_enabled": True,
            "subtitle_split_enabled": True,
            "subtitle_split_target_words": 15,
            "subtitle_split_max_words": 24,
            "semantic_split_max_words_threshold": 20,
            "semantic_split_timeout_seconds": 55,
            "translation_batch_max_chars": 2100,
        },
    )
    assert update_resp.status_code == 200

    history = client.get("/api/admin/subtitle-settings/history", headers=admin_headers)
    assert history.status_code == 200
    history_data = history.json()
    assert history_data["rollback_candidate"] is not None
    assert history_data["rollback_candidate"]["settings"]["subtitle_split_target_words"] == initial_settings["subtitle_split_target_words"]

    rollback = client.post("/api/admin/subtitle-settings/rollback-last", headers=admin_headers)
    assert rollback.status_code == 200
    rollback_settings = rollback.json()["settings"]
    assert rollback_settings["subtitle_split_target_words"] == initial_settings["subtitle_split_target_words"]
    assert rollback_settings["translation_batch_max_chars"] == initial_settings["translation_batch_max_chars"]
