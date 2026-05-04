from __future__ import annotations

import importlib
import io
import json
import os
import re
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from ._regression_helpers import (
    translation_batch_result as _translation_batch_result,
)
from .conftest import (
    _enable_local_asr_model,
    _register_and_login,
    _seed_wallet_balance,
    FASTER_WHISPER_ASR_MODEL,
    QWEN_ASR_MODEL,
)


def test_qwen_asr_model_status_requires_dashscope_api_key(test_client, monkeypatch):
    from app.services import asr_model_registry

    client, _, _ = test_client
    token = _register_and_login(client, email="qwen-status@example.com")

    monkeypatch.setattr(asr_model_registry, "DASHSCOPE_API_KEY", "")

    resp = client.get(
        "/api/asr-models/qwen3-asr-flash-filetrans/status",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["status"] == "missing"
    assert payload["available"] is False
    assert payload["message"] == "DASHSCOPE_API_KEY is missing."


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


def test_asr_model_status_rejects_removed_sensevoice_model():
    from app.services import asr_model_registry

    with pytest.raises(KeyError):
        asr_model_registry.get_asr_model_status("sensevoice-small")


def test_asr_model_status_reports_qwen_disabled_by_env(monkeypatch):
    from app.services import asr_model_registry

    monkeypatch.setenv("QWEN_ASR_ENABLED", "0")

    payload = asr_model_registry.get_asr_model_status("qwen3-asr-flash-filetrans")

    assert payload["status"] == "error"
    assert payload["available"] is False
    assert payload["message"] == "Cloud API is disabled for this deployment."
    assert payload["last_error"] == "qwen_asr_disabled"


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
    assert result["progress_counters"]["segment_total"] == 1
    assert progress_events[0]["current_text"] == "识别中"
    assert progress_events[0]["counters"]["asr_done"] == 0
    assert progress_events[0]["counters"]["asr_estimated"] == 0
    assert any(item["current_text"] == "识别中，已等待 4 秒" for item in progress_events)
    assert progress_events[-1]["current_text"] == "识别完成 1/1"
    assert progress_events[-1]["counters"]["asr_done"] == 1
    assert progress_events[-1]["counters"]["asr_estimated"] == 1


def test_single_asr_progress_uses_real_segment_counts(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    opus_path = tmp_path / "sample.opus"
    opus_path.write_bytes(b"opus")
    req_dir = tmp_path / "req"
    req_dir.mkdir(parents=True, exist_ok=True)

    def fake_transcribe(audio_path, *, model, progress_callback=None, requests_timeout=120):
        if progress_callback:
            progress_callback({"segment_done": 1, "segment_total": 3, "elapsed_seconds": 2})
            progress_callback({"segment_done": 2, "segment_total": 3, "elapsed_seconds": 4})
        return {
            "asr_result_json": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "s1", "begin_time": 0, "end_time": 1000},
                            {"text": "s2", "begin_time": 1000, "end_time": 2000},
                            {"text": "s3", "begin_time": 2000, "end_time": 3000},
                        ]
                    }
                ]
            },
            "usage_seconds": 3,
            "raw_generate_result": {"segment_count": 3},
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_transcribe)

    progress_events: list[dict] = []
    result = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=opus_path,
        req_dir=req_dir,
        asr_model=QWEN_ASR_MODEL,
        source_duration_ms=3000,
        parallel_enabled=False,
        parallel_threshold_seconds=600,
        segment_target_seconds=300,
        max_concurrency=2,
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    assert result["progress_counters"]["segment_done"] == 3
    assert result["progress_counters"]["segment_total"] == 3
    assert any(item["current_text"] == "识别中 1/3" for item in progress_events)
    assert any(item["current_text"] == "识别中 2/3" for item in progress_events)
    assert progress_events[-1]["current_text"] == "识别完成 3/3"


def test_faster_whisper_emits_waiting_progress_before_first_segment(monkeypatch):
    from app.services import faster_whisper_asr as faster_whisper_module

    snapshot = faster_whisper_module.FasterWhisperSettingsSnapshot(
        device="cpu",
        compute_type="",
        cpu_threads=4,
        num_workers=2,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        resolved_device="cpu",
        resolved_device_index=0,
        resolved_compute_type="int8",
    )

    class FakeModel:
        def transcribe(self, audio_path, *, beam_size, word_timestamps, vad_filter, condition_on_previous_text):
            def _segments():
                time.sleep(1.2)
                yield SimpleNamespace(text="hello world", start=0.0, end=1.0, words=[])

            info = SimpleNamespace(
                duration=1.0,
                duration_after_vad=1.0,
                language="en",
                language_probability=0.99,
                all_language_probs=[("en", 0.99)],
            )
            return _segments(), info

    monkeypatch.setattr(faster_whisper_module, "_runtime_settings_snapshot", lambda: snapshot)
    monkeypatch.setattr(faster_whisper_module, "ensure_faster_whisper_model_ready_for_transcribe", lambda: {"status": "ready"})
    monkeypatch.setattr(faster_whisper_module, "_get_or_create_model", lambda settings=None: FakeModel())

    progress_events: list[dict] = []
    result = faster_whisper_module.transcribe_audio_file_with_faster_whisper(
        "dummy.opus",
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    waiting_events = [item for item in progress_events if item.get("segment_done") == 0 and item.get("segment_total") == 0]
    assert result["raw_generate_result"]["segment_count"] == 1
    assert len(waiting_events) >= 2
    assert any(item.get("segment_done") == 1 for item in progress_events)


def test_faster_whisper_retries_without_vad_when_first_pass_is_empty(monkeypatch):
    from app.services import faster_whisper_asr as faster_whisper_module

    snapshot = faster_whisper_module.FasterWhisperSettingsSnapshot(
        device="cpu",
        compute_type="",
        cpu_threads=4,
        num_workers=2,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        resolved_device="cpu",
        resolved_device_index=0,
        resolved_compute_type="int8",
    )

    transcribe_calls: list[bool] = []

    class FakeModel:
        def transcribe(self, audio_path, *, beam_size, word_timestamps, vad_filter, condition_on_previous_text):
            transcribe_calls.append(bool(vad_filter))

            if vad_filter:
                info = SimpleNamespace(
                    duration=1.0,
                    duration_after_vad=0.0,
                    language="en",
                    language_probability=1.0,
                    all_language_probs=[],
                )
                return iter(()), info

            def _segments():
                yield SimpleNamespace(
                    text="short sample",
                    start=0.0,
                    end=1.0,
                    words=[
                        SimpleNamespace(word="short", start=0.0, end=0.4, probability=0.9),
                        SimpleNamespace(word="sample", start=0.4, end=1.0, probability=0.9),
                    ],
                )

            info = SimpleNamespace(
                duration=1.0,
                duration_after_vad=1.0,
                language="en",
                language_probability=1.0,
                all_language_probs=[],
            )
            return _segments(), info

    monkeypatch.setattr(faster_whisper_module, "_runtime_settings_snapshot", lambda: snapshot)
    monkeypatch.setattr(faster_whisper_module, "ensure_faster_whisper_model_ready_for_transcribe", lambda: {"status": "ready"})
    monkeypatch.setattr(faster_whisper_module, "_get_or_create_model", lambda settings=None: FakeModel())

    result = faster_whisper_module.transcribe_audio_file_with_faster_whisper("dummy.opus")

    assert transcribe_calls == [True, False]
    assert result["preview_text"] == "short sample"
    assert result["raw_generate_result"]["segment_count"] == 1
    assert result["settings_summary"]["vad_filter"] is False
    assert result["asr_result_json"]["transcripts"][0]["sentences"][0]["text"] == "short sample"


def test_single_faster_whisper_progress_keeps_waiting_after_segments(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    opus_path = tmp_path / "sample.opus"
    opus_path.write_bytes(b"opus")
    req_dir = tmp_path / "req"
    req_dir.mkdir(parents=True, exist_ok=True)

    def fake_transcribe(audio_path, *, model, progress_callback=None, requests_timeout=120):
        if progress_callback:
            progress_callback({"segment_done": 13, "segment_total": 0, "elapsed_seconds": 39})
            progress_callback({"segment_done": 13, "segment_total": 0, "elapsed_seconds": 52})
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
            "raw_generate_result": {"segment_count": 13},
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_transcribe)

    progress_events: list[dict] = []
    result = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=opus_path,
        req_dir=req_dir,
        asr_model="faster-whisper-medium",
        source_duration_ms=240000,
        parallel_enabled=False,
        parallel_threshold_seconds=600,
        segment_target_seconds=300,
        max_concurrency=1,
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    assert result["progress_counters"]["segment_total"] == 13
    assert result["progress_counters"]["asr_done"] == 13
    assert result["progress_counters"]["asr_estimated"] == 13
    assert any(item["current_text"] == "识别中，已识别 13 段" for item in progress_events)
    assert any(item["current_text"] == "识别中，已识别 13 段，已等待 13 秒" for item in progress_events)
    assert progress_events[-1]["current_text"] == "识别完成 13/13"


def test_single_faster_whisper_stall_keeps_waiting_instead_of_failing(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    opus_path = tmp_path / "sample.opus"
    opus_path.write_bytes(b"opus")
    req_dir = tmp_path / "req"
    req_dir.mkdir(parents=True, exist_ok=True)

    def fake_transcribe(audio_path, *, model, progress_callback=None, requests_timeout=120):
        if progress_callback:
            progress_callback({"segment_done": 2, "segment_total": 0, "elapsed_seconds": 11})
            progress_callback({"segment_done": 2, "segment_total": 0, "elapsed_seconds": 12})
        return {
            "asr_result_json": {"transcripts": [{"sentences": [{"text": "late", "begin_time": 0, "end_time": 1000}]}]},
            "usage_seconds": 1,
            "raw_generate_result": {"segment_count": 2},
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_transcribe)
    monkeypatch.setattr(lesson_service_module, "_single_faster_whisper_stall_timeout_seconds", lambda source_duration_ms: 1)
    progress_events: list[dict] = []

    result = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=opus_path,
        req_dir=req_dir,
        asr_model="faster-whisper-medium",
        source_duration_ms=240000,
        parallel_enabled=False,
        parallel_threshold_seconds=600,
        segment_target_seconds=300,
        max_concurrency=1,
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    assert result["progress_counters"]["segment_total"] == 2
    assert any("当前段耗时较长，继续等待" in item["current_text"] for item in progress_events)
    assert progress_events[-1]["current_text"] == "识别完成 2/2"


def test_faster_whisper_legacy_single_profile_autofixes_to_parallel(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module
    from app.services.lessons import asr_handler as asr_handler_module

    monkeypatch.setattr(
        asr_handler_module,
        "split_audio_segments",
        lambda source_audio, segments_dir, target_seconds, search_window_seconds, duration_ms: [
            (0, 0, 160000, tmp_path / "seg0.opus"),
            (1, 160000, 328000, tmp_path / "seg1.opus"),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "_call_transcribe_segment",
        lambda segment_index, segment_start_ms, segment_end_ms, segment_path, asr_model, result_path: (
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
            None,
        ),
    )

    single_calls = {"count": 0}

    def _unexpected_single(**kwargs):
        single_calls["count"] += 1
        raise AssertionError("legacy faster-whisper profile should auto-enable parallel mode")

    monkeypatch.setattr(lesson_service_module.LessonService, "_transcribe_faster_whisper_single", staticmethod(_unexpected_single))

    result = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=tmp_path / "faster-whisper.opus",
        req_dir=tmp_path / "fw-legacy",
        asr_model="faster-whisper-medium",
        source_duration_ms=328000,
        parallel_enabled=False,
        parallel_threshold_seconds=600,
        segment_target_seconds=300,
        max_concurrency=1,
        progress_callback=None,
    )

    assert single_calls["count"] == 0
    assert result["progress_counters"]["segment_total"] == 2
    assert result["asr_payload"]["transcripts"][0]["words"][1]["begin_time"] == 160000


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


def test_transcribe_audio_file_rejects_removed_sensevoice_model():
    from app.infra import asr_dashscope as asr_runtime

    with pytest.raises(asr_runtime.AsrError) as exc_info:
        asr_runtime.transcribe_audio_file("demo.opus", model="sensevoice-small")

    assert exc_info.value.code == "INVALID_MODEL"
    assert exc_info.value.detail == "sensevoice-small"


def test_removed_sensevoice_module_cannot_be_imported():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.services.sensevoice")


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
    assert FASTER_WHISPER_ASR_MODEL in data["detail"]["supported_models"]
    assert QWEN_ASR_MODEL in data["detail"]["supported_models"]
    assert "sensevoice-small" not in data["detail"]["supported_models"]


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


def test_create_local_asr_lesson_job(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-asr@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module
    from app.services import lesson_service as lesson_service_module

    _enable_local_asr_model(monkeypatch)

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
        "asr_model": FASTER_WHISPER_ASR_MODEL,
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
    assert task_payload["lesson"]["asr_model"] == FASTER_WHISPER_ASR_MODEL
    assert task_payload["workspace"]["scope"] == "lesson"
    assert task_payload["workspace"]["task_id"] == task_id
    assert task_payload["workspace"]["lesson_id"] == task_payload["lesson"]["id"]
    assert task_payload["workspace"]["latest_subtitle_snapshot"]["preview_text"].startswith("Hello world")
    assert task_payload["workspace"]["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Hello world"
    assert task_payload["workspace"]["latest_subtitle_snapshot"]["items"][0]["is_final"] is True
    assert task_payload["workspace"]["restore_pointer"]["task_id"] == task_id

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        workspace_path = Path(task_row.artifacts_json["workspace_summary_path"])
        lesson_workspace_path = workspace_path.parent / f"lesson_{int(task_row.lesson_id)}.json"
        assert workspace_path.exists()
        assert lesson_workspace_path.exists()
        workspace_payload = json.loads(workspace_path.read_text(encoding="utf-8"))
        lesson_workspace_payload = json.loads(lesson_workspace_path.read_text(encoding="utf-8"))
        assert workspace_payload["workspace_id"] == task_id
        assert workspace_payload["summary_path"] == str(workspace_path)
        assert workspace_payload["restore_pointer"]["lesson_id"] == int(task_row.lesson_id)
        assert workspace_payload["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Hello world"
        assert workspace_payload["log_summary"]["events"][-1]["stage"] == "write_lesson"
        assert lesson_workspace_payload["workspace_id"] == task_id
        assert lesson_workspace_payload["lesson_id"] == int(task_row.lesson_id)
    finally:
        verify_session.close()


def test_create_local_asr_lesson_workspace_pointer(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-asr-workspace@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module

    _enable_local_asr_model(monkeypatch)
    _seed_wallet_balance(session_factory, email="local-asr-workspace@example.com")

    class DeferredThread:
        def __init__(self, target=None, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            return None

    monkeypatch.setattr(lesson_command_service_module.threading, "Thread", DeferredThread)

    payload = {
        "asr_model": FASTER_WHISPER_ASR_MODEL,
        "source_filename": "workspace.wav",
        "source_duration_ms": 8_000,
        "runtime_kind": "local_browser",
        "asr_payload": {
            "transcripts": [
                {
                    "sentences": [
                        {"text": "Workspace preview", "begin_time": 0, "end_time": 1200},
                    ]
                }
            ]
        },
    }

    create_task_resp = client.post("/api/lessons/tasks/local-asr", headers=headers, json=payload)
    assert create_task_resp.status_code == 200
    create_payload = create_task_resp.json()
    assert create_payload["workspace"]["scope"] == "task"
    assert create_payload["workspace"]["task_id"] == create_payload["task_id"]
    assert create_payload["workspace"]["lesson_id"] is None
    assert create_payload["workspace"]["source"]["source_filename"] == "workspace.wav"
    assert create_payload["workspace"]["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Workspace preview"

    task_resp = client.get(f"/api/lessons/tasks/{create_payload['task_id']}", headers=headers)
    assert task_resp.status_code == 200
    task_payload = task_resp.json()
    assert task_payload["workspace"]["scope"] == "task"
    assert task_payload["workspace"]["task_id"] == create_payload["task_id"]
    assert task_payload["workspace"]["lesson_id"] is None
    assert task_payload["workspace"]["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Workspace preview"
    assert task_payload["workspace"]["restore_pointer"]["task_id"] == create_payload["task_id"]

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == create_payload["task_id"]))
        assert task_row is not None
        workspace_path = Path(task_row.artifacts_json["workspace_summary_path"])
        assert workspace_path.exists()
        workspace_payload = json.loads(workspace_path.read_text(encoding="utf-8"))
        assert workspace_payload["scope"] == "task"
        assert workspace_payload["summary_path"] == str(workspace_path)
        assert workspace_payload["source"]["source_filename"] == "workspace.wav"
        assert workspace_payload["source"]["runtime_kind"] == "local_browser"
        assert workspace_payload["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Workspace preview"
        assert workspace_payload["restore_pointer"]["task_id"] == create_payload["task_id"]
        assert workspace_payload["restore_pointer"]["lesson_id"] is None
    finally:
        verify_session.close()


def test_create_desktop_local_asr_lesson_task_preserves_runtime_kind(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="desktop-local-asr@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module
    from app.services import lesson_service as lesson_service_module

    lesson_router = _enable_local_asr_model(monkeypatch)
    monkeypatch.setattr(lesson_router, "get_supported_local_desktop_asr_model_keys", lambda: (FASTER_WHISPER_ASR_MODEL,))

    original_get_model_rate = lesson_service_module.get_model_rate

    def fake_get_model_rate(db, model):
        if model == FASTER_WHISPER_ASR_MODEL:
            return SimpleNamespace(points_per_minute=0, price_per_minute_yuan=0, segment_seconds=300, max_concurrency=1)
        return original_get_model_rate(db, model)

    monkeypatch.setattr(lesson_service_module, "get_model_rate", fake_get_model_rate)
    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result(["你好"] * len(texts), total_tokens=18),
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
        user = session.query(User).filter(User.email == "desktop-local-asr@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 10_000
        session.add(account)
        session.commit()
    finally:
        session.close()

    payload = {
        "asr_model": FASTER_WHISPER_ASR_MODEL,
        "source_filename": "desktop-local.wav",
        "source_duration_ms": 9_000,
        "runtime_kind": "desktop_local",
        "asr_payload": {
            "transcripts": [
                {
                    "sentences": [
                        {"text": "Desktop helper result", "begin_time": 0, "end_time": 1600},
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
    assert task_payload["lesson"]["asr_model"] == FASTER_WHISPER_ASR_MODEL
    assert task_payload["workspace"]["scope"] == "lesson"
    assert task_payload["workspace"]["lesson_id"] == task_payload["lesson"]["id"]
    assert task_payload["workspace"]["source"]["runtime_kind"] == "desktop_local"
    assert task_payload["workspace"]["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Desktop helper result"

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        assert task_row.artifacts_json["local_runtime_kind"] == "desktop_local"
        assert task_row.asr_raw_json["mode"] == "desktop_local"
        assert task_row.asr_raw_json["model_name"] == FASTER_WHISPER_ASR_MODEL
        workspace_path = Path(task_row.artifacts_json["workspace_summary_path"])
        assert workspace_path.exists()
        workspace_payload = json.loads(workspace_path.read_text(encoding="utf-8"))
        assert workspace_payload["lesson_id"] == task_row.lesson_id
        assert workspace_payload["source"]["runtime_kind"] == "desktop_local"
        assert workspace_payload["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Desktop helper result"
    finally:
        verify_session.close()


def test_create_local_generated_lesson_persists_completed_result(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-generated@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    from app.services import lesson_service as lesson_service_module

    _enable_local_asr_model(monkeypatch)
    monkeypatch.setattr(lesson_router, "get_supported_local_desktop_asr_model_keys", lambda: (FASTER_WHISPER_ASR_MODEL,))

    original_get_model_rate = lesson_service_module.get_model_rate

    def fake_get_model_rate(db, model):
        if model == FASTER_WHISPER_ASR_MODEL:
            return SimpleNamespace(
                points_per_minute=0,
                price_per_minute_yuan=0,
                cost_per_minute_cents=0,
                cost_per_minute_yuan=0,
                segment_seconds=300,
                max_concurrency=1,
            )
        return original_get_model_rate(db, model)

    monkeypatch.setattr(lesson_service_module, "get_model_rate", fake_get_model_rate)

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "local-generated@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 10_000
        session.add(account)
        session.commit()
    finally:
        session.close()

    payload = {
        "asr_model": FASTER_WHISPER_ASR_MODEL,
        "source_filename": "desktop-local.wav",
        "source_duration_ms": 9_000,
        "runtime_kind": "desktop_local",
        "asr_payload": {
            "transcripts": [
                {
                    "sentences": [
                        {"text": "Desktop helper result", "begin_time": 0, "end_time": 1600},
                    ]
                }
            ],
            "__local_generation_result__": {
                "runtime_kind": "desktop_local",
                "lesson_status": "ready",
                "duration_ms": 1600,
                "variant": {
                    "semantic_split_enabled": False,
                    "split_mode": "asr_sentences",
                    "source_word_count": 3,
                    "strategy_version": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 1600,
                            "text_en": "Desktop helper result",
                            "text_zh": "桌面端结果",
                            "tokens": ["Desktop", "helper", "result"],
                            "audio_url": None,
                        }
                    ],
                    "translate_failed_count": 0,
                },
                "translation_debug": {
                    "total_sentences": 1,
                    "failed_sentences": 0,
                    "request_count": 0,
                    "success_request_count": 0,
                    "usage": {"total_tokens": 0},
                    "latest_error_summary": "",
                },
                "task_result_meta": {
                    "result_kind": "full_success",
                    "result_message": "课程已生成完成",
                    "partial_failure_stage": "",
                    "partial_failure_code": "",
                    "partial_failure_message": "",
                },
                "subtitle_cache_seed": {
                    "semantic_split_enabled": False,
                    "split_mode": "asr_sentences",
                    "source_word_count": 3,
                    "strategy_version": 2,
                    "runtime_kind": "desktop_local",
                    "asr_payload": {
                        "transcripts": [
                            {
                                "sentences": [
                                    {"text": "Desktop helper result", "begin_time": 0, "end_time": 1600},
                                ]
                            }
                        ]
                    },
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 1600,
                            "text_en": "Desktop helper result",
                            "text_zh": "桌面端结果",
                            "tokens": ["Desktop", "helper", "result"],
                            "audio_url": None,
                        }
                    ],
                },
            },
        },
    }

    resp = client.post("/api/lessons/local-asr/complete", headers=headers, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["runtime_kind"] == "desktop_local"
    assert body["completion_kind"] == "full"
    assert body["result_kind"] == "full_success"
    assert body["result_label"] == "完整成功"
    assert body["result_message"] == "课程已生成完成"
    assert body["partial_failure_stage"] == ""
    assert body["partial_failure_code"] == ""
    assert body["partial_failure_message"] == ""
    assert body["lesson"]["asr_model"] == FASTER_WHISPER_ASR_MODEL
    assert body["subtitle_cache_seed"]["runtime_kind"] == "desktop_local"
    assert body["lesson"]["sentences"][0]["text_en"] == "Desktop helper result"
    assert body["workspace"]["scope"] == "lesson"
    assert body["workspace"]["lesson_id"] == body["lesson"]["id"]
    assert body["workspace"]["latest_subtitle_snapshot"]["preview_text"].startswith("Desktop helper result")
    assert body["workspace"]["latest_subtitle_snapshot"]["items"][0]["text_en"] == "Desktop helper result"
    assert body["workspace"]["latest_subtitle_snapshot"]["items"][0]["text_zh"] == "桌面端结果"
    assert body["workspace"]["restore_pointer"]["lesson_id"] == body["lesson"]["id"]

    workspace_path = Path(body["workspace"]["summary_path"])
    assert workspace_path.exists()
    workspace_payload = json.loads(workspace_path.read_text(encoding="utf-8"))
    assert workspace_payload["restore_pointer"]["task_id"] == ""
    assert workspace_payload["restore_pointer"]["lesson_id"] == body["lesson"]["id"]
    assert workspace_payload["latest_subtitle_snapshot"]["items"][0]["source"] == "final_subtitle_seed"
    assert len(workspace_payload["log_summary"]["events"]) == 1


def test_local_generated_lesson_title_rename_keeps_canonical_history_and_progress(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="desktop-link-title@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    _enable_local_asr_model(monkeypatch)
    _seed_wallet_balance(session_factory, email="desktop-link-title@example.com")

    payload = {
        "asr_model": FASTER_WHISPER_ASR_MODEL,
        "source_filename": "downloaded-video.mp4",
        "source_duration_ms": 1600,
        "runtime_kind": "desktop_local",
        "asr_payload": {
            "transcripts": [
                {
                    "sentences": [
                        {"text": "Desktop helper result", "begin_time": 0, "end_time": 1600},
                    ]
                }
            ],
            "__local_generation_result__": {
                "runtime_kind": "desktop_local",
                "lesson_status": "ready",
                "duration_ms": 1600,
                "variant": {
                    "semantic_split_enabled": False,
                    "split_mode": "asr_sentences",
                    "source_word_count": 3,
                    "strategy_version": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 1600,
                            "text_en": "Desktop helper result",
                            "text_zh": "桌面端结果",
                            "tokens": ["Desktop", "helper", "result"],
                            "audio_url": None,
                        }
                    ],
                    "translate_failed_count": 0,
                },
                "translation_debug": {
                    "total_sentences": 1,
                    "failed_sentences": 0,
                    "request_count": 0,
                    "success_request_count": 0,
                    "usage": {"total_tokens": 0},
                    "latest_error_summary": "",
                },
                "task_result_meta": {
                    "result_kind": "full_success",
                    "result_message": "课程已生成完成",
                    "partial_failure_stage": "",
                    "partial_failure_code": "",
                    "partial_failure_message": "",
                },
                "subtitle_cache_seed": {
                    "semantic_split_enabled": False,
                    "split_mode": "asr_sentences",
                    "source_word_count": 3,
                    "strategy_version": 2,
                    "runtime_kind": "desktop_local",
                    "asr_payload": {
                        "transcripts": [
                            {
                                "sentences": [
                                    {"text": "Desktop helper result", "begin_time": 0, "end_time": 1600},
                                ]
                            }
                        ]
                    },
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 1600,
                            "text_en": "Desktop helper result",
                            "text_zh": "桌面端结果",
                            "tokens": ["Desktop", "helper", "result"],
                            "audio_url": None,
                        }
                    ],
                },
            },
        },
    }

    create_resp = client.post("/api/lessons/local-asr/complete", headers=headers, json=payload)
    assert create_resp.status_code == 200
    lesson_id = create_resp.json()["lesson"]["id"]

    rename_resp = client.patch(
        f"/api/lessons/{lesson_id}",
        headers=headers,
        json={"title": "Edited desktop link title"},
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["title"] == "Edited desktop link title"

    progress_resp = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 900},
    )
    assert progress_resp.status_code == 200

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_payload = detail_resp.json()
    assert detail_payload["title"] == "Edited desktop link title"
    assert detail_payload["source_filename"] == "downloaded-video.mp4"

    catalog_resp = client.get("/api/lessons/catalog", headers=headers)
    assert catalog_resp.status_code == 200
    catalog_item = next(item for item in catalog_resp.json()["items"] if item["id"] == lesson_id)
    assert catalog_item["title"] == "Edited desktop link title"
    assert catalog_item["source_filename"] == "downloaded-video.mp4"
    assert catalog_item["progress_summary"]["completed_sentence_count"] == 1


def test_parallel_asr_trigger_by_duration(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module
    from app.services.lessons import asr_handler as asr_handler_module

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
        asr_handler_module,
        "split_audio_segments",
        lambda source_audio, segments_dir, target_seconds, search_window_seconds, duration_ms: [
            (0, 0, 5000, tmp_path / "seg0.opus"),
            (1, 5000, 10000, tmp_path / "seg1.opus"),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "_transcribe_segment",
        lambda segment_index, segment_start_ms, segment_end_ms, segment_path, asr_model: (
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
    assert [item["begin_time"] for item in payload_parallel["transcripts"][0]["words"]] == [0, 5000]
    assert [item["begin_time"] for item in payload_parallel["transcripts"][0]["sentences"]] == [0, 5000]


def test_faster_whisper_parallel_threshold_converges_to_five_minutes(monkeypatch, tmp_path):
    from app.services import lesson_service as lesson_service_module

    single_calls = {"count": 0}

    def fake_single_transcribe(path: str, model: str):
        single_calls["count"] += 1
        return {
            "asr_result_json": {
                "properties": {"original_duration_in_milliseconds": 328000},
                "transcripts": [{"channel_id": 0, "sentences": [{"sentence_id": 0, "begin_time": 0, "end_time": 900, "text": "single"}]}],
            }
        }

    monkeypatch.setattr(lesson_service_module, "transcribe_audio_file", fake_single_transcribe)
    monkeypatch.setattr(
        asr_handler_module,
        "split_audio_segments",
        lambda source_audio, segments_dir, target_seconds, search_window_seconds, duration_ms: [
            (0, 0, 160000, tmp_path / "seg0.opus"),
            (1, 160000, 328000, tmp_path / "seg1.opus"),
        ],
    )
    monkeypatch.setattr(
        lesson_service_module,
        "_transcribe_segment",
        lambda segment_index, segment_start_ms, segment_end_ms, segment_path, asr_model: (
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
            None,
        ),
    )

    result = lesson_service_module.LessonService._transcribe_with_optional_parallel(
        opus_path=tmp_path / "faster-whisper.opus",
        req_dir=tmp_path / "fw",
        asr_model="faster-whisper-medium",
        source_duration_ms=328000,
        parallel_enabled=True,
        parallel_threshold_seconds=480,
        segment_target_seconds=160,
        max_concurrency=2,
        progress_callback=None,
    )

    payload = result["asr_payload"]
    assert single_calls["count"] == 0
    assert result["progress_counters"]["segment_total"] == 2
    assert payload["transcripts"][0]["words"][0]["begin_time"] == 0
    assert payload["transcripts"][0]["words"][1]["begin_time"] == 160000
