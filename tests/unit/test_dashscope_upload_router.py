from __future__ import annotations

import importlib

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

import app.api.routers.dashscope_upload as dashscope_upload_router
from app.db import Base, create_database_engine, get_db
from app.main import create_app

lessons_router = importlib.import_module("app.api.routers.lessons.router")


class _FakeResponse:
    def __init__(self, *, status_code: int, payload: dict, text: str = "") -> None:
        self.status_code = int(status_code)
        self._payload = dict(payload)
        self.text = text

    def json(self) -> dict:
        return dict(self._payload)


def _build_test_client(tmp_path):
    db_file = tmp_path / "dashscope_upload_router.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)
    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), engine


def _register_and_login(client: TestClient, *, email: str, password: str = "Passw0rd!123") -> str:
    register_resp = client.post(
        "/api/auth/register",
        json={"username": email.split("@")[0], "email": email, "password": password},
    )
    assert register_resp.status_code == 200
    login_resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    return str(login_resp.json()["access_token"])


def test_request_url_success(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-user@example.com")

        monkeypatch.setattr(dashscope_upload_router, "DASHSCOPE_API_KEY", "test-api-key")

        def fake_get(url: str, *, headers: dict, params: dict, timeout: int):
            assert "uploads" in url
            assert headers["Authorization"] == "Bearer test-api-key"
            assert params["action"] == "getPolicy"
            return _FakeResponse(
                status_code=200,
                payload={
                    "data": {
                        "upload_host": "https://oss.example.com",
                        "upload_dir": "uploads/20260326/demo.mp4",
                        "oss_fields": {"policy": "p", "signature": "s"},
                        "expires_in_seconds": 900,
                    }
                },
            )

        monkeypatch.setattr(dashscope_upload_router.requests, "get", fake_get)

        resp = client.post(
            "/api/dashscope-upload/request-url",
            headers={"Authorization": f"Bearer {token}"},
            json={"filename": "demo.mp4", "content_type": "video/mp4"},
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["ok"] is True
        assert payload["upload_host"] == "https://oss.example.com"
        assert payload["upload_dir"] == "uploads/20260326/demo.mp4"
        assert payload["upload_url"] == "https://oss.example.com"
        assert payload["file_id"] == "uploads/20260326/demo.mp4"
        assert payload["file_url"] == "oss://uploads/20260326/demo.mp4"
        assert payload["oss_fields"]["policy"] == "p"
        assert payload["oss_fields"]["key"] == "uploads/20260326/demo.mp4"
        assert payload["oss_fields"]["x-oss-content-type"] == "video/mp4"
        assert payload["oss_fields"]["success_action_status"] == "200"
        assert int(payload["expires_in_seconds"]) == 900
    finally:
        client.close()
        engine.dispose()


def test_request_url_normalizes_flat_policy_fields(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-flat-policy@example.com")

        monkeypatch.setattr(dashscope_upload_router, "DASHSCOPE_API_KEY", "test-api-key")

        def fake_get(url: str, *, headers: dict, params: dict, timeout: int):
            assert "uploads" in url
            assert params["action"] == "getPolicy"
            return _FakeResponse(
                status_code=200,
                payload={
                    "data": {
                        "upload_host": "https://oss.example.com",
                        "upload_dir": "uploads/20260326/session-abc123",
                        "oss_access_key_id": "ak",
                        "signature": "sig",
                        "policy": "p",
                        "x_oss_object_acl": "private",
                        "x_oss_forbid_overwrite": "true",
                        "expires_in_seconds": 1200,
                    }
                },
            )

        monkeypatch.setattr(dashscope_upload_router.requests, "get", fake_get)

        resp = client.post(
            "/api/dashscope-upload/request-url",
            headers={"Authorization": f"Bearer {token}"},
            json={"filename": "demo.mp4", "content_type": "video/mp4"},
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["ok"] is True
        assert payload["upload_url"] == "https://oss.example.com"
        assert payload["upload_dir"] == "uploads/20260326/session-abc123"
        assert payload["file_id"] == "uploads/20260326/session-abc123/demo.mp4"
        assert payload["file_url"] == "oss://uploads/20260326/session-abc123/demo.mp4"
        assert payload["oss_fields"]["OSSAccessKeyId"] == "ak"
        assert payload["oss_fields"]["Signature"] == "sig"
        assert payload["oss_fields"]["policy"] == "p"
        assert payload["oss_fields"]["x-oss-object-acl"] == "private"
        assert payload["oss_fields"]["x-oss-forbid-overwrite"] == "true"
        assert payload["oss_fields"]["key"] == "uploads/20260326/session-abc123/demo.mp4"
        assert payload["oss_fields"]["x-oss-content-type"] == "video/mp4"
        assert payload["oss_fields"]["success_action_status"] == "200"
    finally:
        client.close()
        engine.dispose()


def test_request_url_sanitizes_non_ascii_storage_key(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-unicode-name@example.com")

        monkeypatch.setattr(dashscope_upload_router, "DASHSCOPE_API_KEY", "test-api-key")

        def fake_get(url: str, *, headers: dict, params: dict, timeout: int):
            _ = (url, headers, params, timeout)
            return _FakeResponse(
                status_code=200,
                payload={
                    "data": {
                        "upload_host": "https://oss.example.com",
                        "upload_dir": "dashscope-instant/session-abc123/2026-03-27/upload-slot",
                        "oss_fields": {"policy": "p", "signature": "s"},
                        "expires_in_seconds": 1200,
                    }
                },
            )

        monkeypatch.setattr(dashscope_upload_router.requests, "get", fake_get)

        resp = client.post(
            "/api/dashscope-upload/request-url",
            headers={"Authorization": f"Bearer {token}"},
            json={"filename": "测试.mp4", "content_type": "video/mp4"},
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["ok"] is True
        assert payload["file_id"].startswith("dashscope-instant/session-abc123/2026-03-27/upload-slot/")
        assert payload["file_url"].startswith("oss://dashscope-instant/session-abc123/2026-03-27/upload-slot/")
        assert payload["file_id"].endswith(".mp4")
        assert payload["oss_fields"]["key"] == payload["file_id"]
        assert "测试" not in payload["file_id"]
    finally:
        client.close()
        engine.dispose()


def test_request_url_missing_api_key(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-missing-key@example.com")
        monkeypatch.setattr(dashscope_upload_router, "DASHSCOPE_API_KEY", "")

        resp = client.post(
            "/api/dashscope-upload/request-url",
            headers={"Authorization": f"Bearer {token}"},
            json={"filename": "demo.mp4", "content_type": "video/mp4"},
        )
        assert resp.status_code == 503
        payload = resp.json()
        assert payload["ok"] is False
        assert payload["error_code"] == "ASR_API_KEY_MISSING"
    finally:
        client.close()
        engine.dispose()


def test_request_url_upstream_error(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-upstream-error@example.com")
        monkeypatch.setattr(dashscope_upload_router, "DASHSCOPE_API_KEY", "test-api-key")

        def fake_get(url: str, *, headers: dict, params: dict, timeout: int):
            return _FakeResponse(
                status_code=429,
                payload={"code": "TooManyRequests", "message": "rate limited"},
                text='{"code":"TooManyRequests","message":"rate limited"}',
            )

        monkeypatch.setattr(dashscope_upload_router.requests, "get", fake_get)

        resp = client.post(
            "/api/dashscope-upload/request-url",
            headers={"Authorization": f"Bearer {token}"},
            json={"filename": "demo.mp4", "content_type": "video/mp4"},
        )
        assert resp.status_code == 502
        payload = resp.json()
        assert payload["ok"] is False
        assert payload["error_code"] == "DASHSCOPE_POLICY_FAILED"
        assert "TooManyRequests" in str(payload["detail"])
    finally:
        client.close()
        engine.dispose()


def test_legacy_dashscope_file_task_endpoint_is_disabled(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-full-flow@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        monkeypatch.setattr(dashscope_upload_router, "DASHSCOPE_API_KEY", "test-api-key")

        def fake_get(url: str, *, headers: dict, params: dict, timeout: int):
            return _FakeResponse(
                status_code=200,
                payload={
                    "data": {
                        "upload_host": "https://oss.example.com",
                        "upload_dir": "uploads/20260326/full-flow.mp4",
                        "oss_fields": {"policy": "p", "signature": "s"},
                        "expires_in_seconds": 600,
                    }
                },
            )

        monkeypatch.setattr(dashscope_upload_router.requests, "get", fake_get)

        monkeypatch.setattr(lessons_router, "get_supported_upload_asr_model_keys", lambda: ("qwen3-asr-flash-filetrans",))

        request_url_resp = client.post(
            "/api/dashscope-upload/request-url",
            headers=headers,
            json={"filename": "full-flow.mp4", "content_type": "video/mp4"},
        )
        assert request_url_resp.status_code == 200
        file_id = request_url_resp.json()["file_id"]
        file_url = request_url_resp.json()["file_url"]

        create_task_resp = client.post(
            "/api/lessons/tasks",
            headers=headers,
            data={
                "asr_model": "qwen3-asr-flash-filetrans",
                "generation_options_json": "{}",
                "dashscope_file_id": file_id,
                "dashscope_file_url": file_url,
                "source_filename": "full-flow.mp4",
            },
        )
        assert create_task_resp.status_code == 410
        payload = create_task_resp.json()
        assert payload["ok"] is False
        assert payload["error_code"] == "LEGACY_GENERATION_DISABLED"
    finally:
        client.close()
        engine.dispose()


def test_legacy_create_task_endpoint_is_disabled_before_dashscope_validation(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-requires-file-id@example.com")
        monkeypatch.setattr(lessons_router, "get_supported_upload_asr_model_keys", lambda: ("qwen3-asr-flash-filetrans",))

        resp = client.post(
            "/api/lessons/tasks",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "asr_model": "qwen3-asr-flash-filetrans",
                "dashscope_file_id": "",
            },
        )

        assert resp.status_code == 410
        payload = resp.json()
        assert payload["ok"] is False
        assert payload["error_code"] == "LEGACY_GENERATION_DISABLED"
    finally:
        client.close()
        engine.dispose()


def test_subtitle_variant_endpoints_are_disabled(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="subtitle-variants-disabled@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        def fail_if_called(*args, **kwargs):
            raise AssertionError("build_subtitle_variant must not be called")

        monkeypatch.setattr(lessons_router.LessonService, "build_subtitle_variant", fail_if_called)

        resp = client.post(
            "/api/lessons/999999/subtitle-variants",
            headers=headers,
            json={"unexpected": "body"},
        )
        assert resp.status_code == 410
        payload = resp.json()
        assert payload["ok"] is False
        assert payload["error_code"] == "SUBTITLE_VARIANTS_DISABLED"

        stream_resp = client.post(
            "/api/lessons/999999/subtitle-variants/stream",
            headers=headers,
            json={"unexpected": "body"},
        )
        assert stream_resp.status_code == 410
        stream_payload = stream_resp.json()
        assert stream_payload["ok"] is False
        assert stream_payload["error_code"] == "SUBTITLE_VARIANTS_DISABLED"
    finally:
        client.close()
        engine.dispose()


def test_upload_task_endpoint_accepts_media_file(tmp_path, monkeypatch):
    client, engine = _build_test_client(tmp_path)
    try:
        token = _register_and_login(client, email="dashscope-upload-file-url@example.com")
        headers = {"Authorization": f"Bearer {token}"}
        recorded: dict[str, object] = {}

        def fake_create_lesson_task_from_upload_file(
            *,
            upload_file,
            owner_user_id,
            asr_model,
            generation_options=None,
            db,
        ):
            _ = (owner_user_id, db)
            recorded["filename"] = str(upload_file.filename or "")
            recorded["asr_model"] = str(asr_model or "")
            recorded["generation_options"] = dict(generation_options or {})
            return {
                "task_id": "task-b1-flow-002",
                "requested_asr_model": asr_model,
                "effective_asr_model": asr_model,
                "model_fallback_applied": False,
                "model_fallback_reason": "",
                "requested_generation_options": dict(generation_options or {}),
                "effective_generation_options": dict(generation_options or {}),
            }

        monkeypatch.setattr(lessons_router, "create_lesson_task_from_upload_file", fake_create_lesson_task_from_upload_file)
        monkeypatch.setattr(lessons_router, "get_supported_upload_asr_model_keys", lambda: ("qwen3-asr-flash-filetrans",))
        monkeypatch.setattr(lessons_router, "get_task", lambda *args, **kwargs: None)

        create_task_resp = client.post(
            "/api/lessons/tasks/upload",
            headers=headers,
            data={
                "asr_model": "qwen3-asr-flash-filetrans",
                "generation_options_json": '{"zh_translation": false, "vocabulary_annotation": false, "word_explanation": false}',
            },
            files={"video_file": ("full-flow.mp4", b"fake video bytes", "video/mp4")},
        )
        assert create_task_resp.status_code == 200
        assert create_task_resp.json()["task_id"] == "task-b1-flow-002"
        assert recorded["filename"] == "full-flow.mp4"
        assert recorded["asr_model"] == "qwen3-asr-flash-filetrans"
        assert recorded["generation_options"]["zh_translation"] is False
    finally:
        client.close()
        engine.dispose()
