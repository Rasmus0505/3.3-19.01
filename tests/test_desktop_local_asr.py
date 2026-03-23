from __future__ import annotations

import time

from fastapi.testclient import TestClient

from scripts.run_desktop_backend import create_desktop_helper_app


def test_desktop_helper_transcribe_route_reads_local_source_and_returns_asr_payload(tmp_path, monkeypatch):
    from app.api.routers import desktop_asr as desktop_asr_router

    source_path = tmp_path / "sample.wav"
    source_path.write_bytes(b"fake-audio")

    monkeypatch.setattr(desktop_asr_router, "probe_audio_duration_ms", lambda _path: 4321)
    monkeypatch.setattr(desktop_asr_router, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
    monkeypatch.setattr(
        desktop_asr_router,
        "transcribe_audio_file",
        lambda audio_path, *, model, known_duration_ms=None: {
            "model": model,
            "task_status": "SUCCEEDED",
            "preview_text": "hello from desktop helper",
            "usage_seconds": 5,
            "asr_result_json": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "hello from desktop helper", "begin_time": 0, "end_time": 1200},
                        ]
                    }
                ]
            },
        },
    )

    app = create_desktop_helper_app({"model_dir": str(tmp_path / "models")})
    with TestClient(app) as client:
        resp = client.post(
            "/api/desktop-asr/transcribe",
            json={
                "model_key": "faster-whisper-medium",
                "source_path": str(source_path),
                "source_filename": "sample.wav",
            },
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["runtime_kind"] == "desktop_local"
    assert payload["source_duration_ms"] == 4321
    assert payload["preview_text"] == "hello from desktop helper"
    assert payload["asr_result_json"]["transcripts"][0]["sentences"][0]["text"] == "hello from desktop helper"


def test_desktop_helper_generate_route_returns_local_generation_result(tmp_path, monkeypatch):
    from app.api.routers import desktop_asr as desktop_asr_router

    source_path = tmp_path / "sample.wav"
    source_path.write_bytes(b"fake-audio")

    monkeypatch.setattr(desktop_asr_router, "probe_audio_duration_ms", lambda _path: 4321)
    monkeypatch.setattr(desktop_asr_router, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
    monkeypatch.setattr(
        desktop_asr_router,
        "transcribe_audio_file",
        lambda audio_path, *, model, known_duration_ms=None: {
            "model": model,
            "task_status": "SUCCEEDED",
            "preview_text": "hello from local generate",
            "usage_seconds": 5,
            "asr_result_json": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "hello from local generate", "begin_time": 0, "end_time": 1200},
                        ]
                    }
                ]
            },
        },
    )
    monkeypatch.setattr(
        desktop_asr_router.LessonService,
        "build_local_generation_result",
        lambda **kwargs: {
            "runtime_kind": "desktop_local",
            "lesson_status": "ready",
            "duration_ms": 1200,
            "variant": {
                "semantic_split_enabled": False,
                "split_mode": "asr_sentences",
                "source_word_count": 3,
                "strategy_version": 2,
                "sentences": [
                    {
                        "idx": 0,
                        "begin_ms": 0,
                        "end_ms": 1200,
                        "text_en": "hello from local generate",
                        "text_zh": "你好",
                        "tokens": ["hello", "from", "local", "generate"],
                        "audio_url": None,
                    }
                ],
                "translate_failed_count": 0,
            },
            "translation_debug": {"failed_sentences": 0, "usage": {"total_tokens": 12}},
            "task_result_meta": {"result_kind": "full_success", "result_message": "课程已生成完成"},
            "subtitle_cache_seed": {"runtime_kind": "desktop_local"},
        },
    )

    app = create_desktop_helper_app({"model_dir": str(tmp_path / "models")})
    with TestClient(app) as client:
        resp = client.post(
            "/api/desktop-asr/generate",
            json={
                "model_key": "faster-whisper-medium",
                "source_path": str(source_path),
                "source_filename": "sample.wav",
                "runtime_kind": "desktop_local",
            },
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["runtime_kind"] == "desktop_local"
    assert payload["local_generation_result"]["lesson_status"] == "ready"
    assert payload["local_generation_result"]["variant"]["sentences"][0]["text_en"] == "hello from local generate"


def test_desktop_helper_transcribe_upload_route_returns_browser_local_asr_payload(tmp_path, monkeypatch):
    from app.api.routers import desktop_asr as desktop_asr_router

    monkeypatch.setattr(desktop_asr_router, "probe_audio_duration_ms", lambda _path: 7654)
    monkeypatch.setattr(desktop_asr_router, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
    monkeypatch.setattr(
        desktop_asr_router,
        "transcribe_audio_file",
        lambda audio_path, *, model, known_duration_ms=None: {
            "model": model,
            "task_status": "SUCCEEDED",
            "preview_text": "hello from browser local",
            "usage_seconds": 7,
            "asr_result_json": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "hello from browser local", "begin_time": 0, "end_time": 1500},
                        ]
                    }
                ]
            },
        },
    )

    app = create_desktop_helper_app({"model_dir": str(tmp_path / "models")})
    with TestClient(app) as client:
        resp = client.post(
            "/api/desktop-asr/transcribe-upload",
            data={
                "model_key": "faster-whisper-medium",
                "runtime_kind": "browser_local",
            },
            files={
                "video_file": ("sample.wav", b"fake-audio", "audio/wav"),
            },
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["runtime_kind"] == "browser_local"
    assert payload["source_duration_ms"] == 7654
    assert payload["preview_text"] == "hello from browser local"
    assert payload["asr_result_json"]["transcripts"][0]["sentences"][0]["text"] == "hello from browser local"


def test_desktop_helper_url_import_task_downloads_public_media_and_exposes_file(tmp_path, monkeypatch):
    from app.api.routers import desktop_asr as desktop_asr_router

    desktop_asr_router._URL_IMPORT_TASKS.clear()

    def fake_download(source_url, output_dir, *, progress_callback=None, cancel_event=None):
        assert source_url == "https://example.com/watch?v=demo"
        assert cancel_event is not None
        if callable(progress_callback):
            progress_callback(
                {
                    "status": "running",
                    "progress_percent": 48,
                    "status_text": "正在下载素材",
                    "downloaded_bytes": 480,
                    "total_bytes": 1000,
                    "source_filename": "lesson.mp4",
                }
            )
        source_path = output_dir / "lesson.mp4"
        source_path.write_bytes(b"downloaded-video")
        return {
            "source_url": source_url,
            "source_path": str(source_path),
            "source_filename": "lesson.mp4",
            "content_type": "video/mp4",
            "extractor_key": "Generic",
            "webpage_url": source_url,
            "duration_seconds": 37,
        }

    monkeypatch.setattr(desktop_asr_router, "download_public_media", fake_download)

    app = create_desktop_helper_app({"model_dir": str(tmp_path / "models")})
    with TestClient(app) as client:
        create_resp = client.post(
            "/api/desktop-asr/url-import/tasks",
            json={"source_url": "https://example.com/watch?v=demo"},
        )

        assert create_resp.status_code == 200
        create_payload = create_resp.json()
        assert create_payload["ok"] is True
        task_id = create_payload["task_id"]

        task_payload = None
        for _ in range(50):
            task_resp = client.get(f"/api/desktop-asr/url-import/tasks/{task_id}")
            assert task_resp.status_code == 200
            task_payload = task_resp.json()
            if task_payload["status"] == "succeeded":
                break
            time.sleep(0.02)

        assert task_payload is not None
        assert task_payload["status"] == "succeeded"
        assert task_payload["source_filename"] == "lesson.mp4"
        assert task_payload["content_type"] == "video/mp4"
        assert task_payload["duration_seconds"] == 37

        file_resp = client.get(f"/api/desktop-asr/url-import/tasks/{task_id}/file")

    assert file_resp.status_code == 200
    assert file_resp.content == b"downloaded-video"


def test_desktop_helper_url_import_task_can_be_cancelled(tmp_path, monkeypatch):
    from app.api.routers import desktop_asr as desktop_asr_router

    desktop_asr_router._URL_IMPORT_TASKS.clear()

    def fake_download(source_url, output_dir, *, progress_callback=None, cancel_event=None):
        assert source_url == "https://example.com/watch?v=cancel"
        assert cancel_event is not None
        if callable(progress_callback):
            progress_callback(
                {
                    "status": "running",
                    "progress_percent": 12,
                    "status_text": "正在下载素材",
                    "downloaded_bytes": 120,
                    "total_bytes": 1000,
                    "source_filename": "cancel.mp4",
                }
            )
        while not cancel_event.is_set():
            time.sleep(0.01)
        raise desktop_asr_router.MediaError("URL_IMPORT_CANCELLED", "已取消链接下载", "cancelled in test")

    monkeypatch.setattr(desktop_asr_router, "download_public_media", fake_download)

    app = create_desktop_helper_app({"model_dir": str(tmp_path / "models")})
    with TestClient(app) as client:
        create_resp = client.post(
            "/api/desktop-asr/url-import/tasks",
            json={"source_url": "https://example.com/watch?v=cancel"},
        )

        assert create_resp.status_code == 200
        task_id = create_resp.json()["task_id"]

        running_payload = None
        for _ in range(50):
            task_resp = client.get(f"/api/desktop-asr/url-import/tasks/{task_id}")
            assert task_resp.status_code == 200
            running_payload = task_resp.json()
            if running_payload["status"] in {"running", "cancelling", "cancelled"}:
                break
            time.sleep(0.02)

        assert running_payload is not None

        cancel_resp = client.post(f"/api/desktop-asr/url-import/tasks/{task_id}/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] in {"cancelling", "cancelled"}

        cancelled_payload = None
        for _ in range(50):
            task_resp = client.get(f"/api/desktop-asr/url-import/tasks/{task_id}")
            assert task_resp.status_code == 200
            cancelled_payload = task_resp.json()
            if cancelled_payload["status"] == "cancelled":
                break
            time.sleep(0.02)

        assert cancelled_payload is not None
        assert cancelled_payload["status"] == "cancelled"
        assert cancelled_payload["error_code"] == "URL_IMPORT_CANCELLED"
        assert cancelled_payload["error_message"] == "已取消链接下载"
