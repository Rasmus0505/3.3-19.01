from __future__ import annotations

import time
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.main import create_app


def test_ensure_faster_whisper_download_skips_when_cache_ready(tmp_path, monkeypatch):
    from app.services import faster_whisper_asr as module

    model_dir = tmp_path / "faster-whisper-medium"
    model_dir.mkdir(parents=True, exist_ok=True)
    for name in module.FASTER_WHISPER_REQUIRED_FILES:
        (model_dir / name).write_text("ok", encoding="utf-8")

    monkeypatch.setattr(module, "FASTER_WHISPER_MODEL_DIR", model_dir)
    monkeypatch.setattr(module, "FASTER_WHISPER_MODELSCOPE_MODEL_ID", "pengzhendong/faster-whisper-medium")
    monkeypatch.setattr(module, "has_faster_whisper_model_cache", lambda model_dir=None: True)
    monkeypatch.setattr(module, "_model_cache_matches_current_config", lambda: True)

    assert module.ensure_faster_whisper_model_downloaded(force_refresh=False) == model_dir


def test_transcribe_audio_file_with_faster_whisper_builds_expected_payload(monkeypatch):
    from app.services import faster_whisper_asr as module

    captured = {}
    snapshot = module.FasterWhisperSettingsSnapshot(
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

    class DummyModel:
        def transcribe(self, audio_path, **kwargs):
            captured["audio_path"] = audio_path
            captured["kwargs"] = dict(kwargs)
            segment = SimpleNamespace(
                text=" Hello world. ",
                start=0.0,
                end=1.2,
                words=[
                    SimpleNamespace(word="Hello", start=0.0, end=0.5, probability=0.97),
                    SimpleNamespace(word="world.", start=0.5, end=1.2, probability=0.96),
                ],
            )
            info = SimpleNamespace(
                language="en",
                language_probability=0.99,
                duration=1.2,
                duration_after_vad=1.2,
                all_language_probs=[("en", 0.99)],
            )
            return iter([segment]), info

    monkeypatch.setattr(module, "_runtime_settings_snapshot", lambda: snapshot)
    monkeypatch.setattr(module, "ensure_faster_whisper_model_ready_for_transcribe", lambda: {"status": "ready"})
    monkeypatch.setattr(module, "_get_or_create_model", lambda settings=None: DummyModel())

    progress_events: list[dict] = []
    result = module.transcribe_audio_file_with_faster_whisper(
        "demo.wav",
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    transcript = result["asr_result_json"]["transcripts"][0]
    assert result["model"] == module.FASTER_WHISPER_ASR_MODEL
    assert result["task_status"] == "SUCCEEDED"
    assert result["preview_text"] == "Hello world."
    assert transcript["lang"] == "en"
    assert transcript["sentences"][0]["text"] == "Hello world."
    assert transcript["words"][0]["surface"] == "Hello"
    assert transcript["words"][1]["punctuation"] == "."
    assert captured["audio_path"] == "demo.wav"
    assert captured["kwargs"]["beam_size"] == 5
    assert captured["kwargs"]["word_timestamps"] is True
    assert captured["kwargs"]["vad_filter"] is True
    assert result["settings_summary"]["resolved_compute_type"] == "int8"
    assert progress_events[0]["elapsed_seconds"] == 0
    assert progress_events[0]["segment_done"] == 0
    assert progress_events[0]["segment_total"] == 0
    assert any(item["segment_done"] == 1 and item["segment_total"] == 0 for item in progress_events)
    assert progress_events[-1]["segment_done"] == 1
    assert progress_events[-1]["segment_total"] == 1
    assert progress_events[-1]["elapsed_seconds"] >= 0


def test_transcribe_audio_file_with_faster_whisper_keeps_waiting_after_first_segment(monkeypatch):
    from app.services import faster_whisper_asr as module

    snapshot = module.FasterWhisperSettingsSnapshot(
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

    class DummyModel:
        def transcribe(self, audio_path, **kwargs):
            def _segments():
                time.sleep(0.2)
                yield SimpleNamespace(text="first", start=0.0, end=1.0, words=[])
                time.sleep(1.3)
                yield SimpleNamespace(text="second", start=1.0, end=2.0, words=[])

            info = SimpleNamespace(
                language="en",
                language_probability=0.99,
                duration=2.0,
                duration_after_vad=2.0,
                all_language_probs=[("en", 0.99)],
            )
            return _segments(), info

    monkeypatch.setattr(module, "_runtime_settings_snapshot", lambda: snapshot)
    monkeypatch.setattr(module, "ensure_faster_whisper_model_ready_for_transcribe", lambda: {"status": "ready"})
    monkeypatch.setattr(module, "_get_or_create_model", lambda settings=None: DummyModel())

    progress_events: list[dict] = []
    module.transcribe_audio_file_with_faster_whisper(
        "delayed.wav",
        progress_callback=lambda payload: progress_events.append(dict(payload)),
    )

    single_segment_events = [
        item
        for item in progress_events
        if item.get("segment_done") == 1 and item.get("segment_total") == 0
    ]
    assert len(single_segment_events) >= 2
    assert progress_events[-1]["segment_done"] == 2
    assert progress_events[-1]["segment_total"] == 2


def test_transcribe_audio_file_with_faster_whisper_falls_back_to_cpu_when_cuda_runtime_missing(monkeypatch):
    from app.services import faster_whisper_asr as module

    snapshot = module.FasterWhisperSettingsSnapshot(
        device="auto",
        compute_type="",
        cpu_threads=4,
        num_workers=2,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        resolved_device="cuda:0",
        resolved_device_index=0,
        resolved_compute_type="float16",
    )

    class BrokenCudaModel:
        def transcribe(self, audio_path, **kwargs):
            raise RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")

    class CpuFallbackModel:
        def transcribe(self, audio_path, **kwargs):
            segment = SimpleNamespace(text="fallback works", start=0.0, end=1.0, words=[])
            info = SimpleNamespace(
                language="en",
                language_probability=0.99,
                duration=1.0,
                duration_after_vad=1.0,
                all_language_probs=[("en", 0.99)],
            )
            return iter([segment]), info

    created_devices: list[str] = []

    def fake_get_or_create_model(settings=None):
        assert settings is not None
        created_devices.append(settings.resolved_device)
        if settings.resolved_device.startswith("cuda"):
            return BrokenCudaModel()
        return CpuFallbackModel()

    monkeypatch.setattr(module, "_runtime_settings_snapshot", lambda: snapshot)
    monkeypatch.setattr(module, "ensure_faster_whisper_model_ready_for_transcribe", lambda: {"status": "ready"})
    monkeypatch.setattr(module, "_get_or_create_model", fake_get_or_create_model)

    result = module.transcribe_audio_file_with_faster_whisper("fallback.wav")

    assert created_devices == ["cuda:0", "cpu"]
    assert result["settings_summary"]["resolved_device"] == "cpu"
    assert result["settings_summary"]["resolved_compute_type"] == "int8"
    assert result["raw_generate_result"]["segment_count"] == 1


def test_prepare_faster_whisper_model_returns_preparing_when_scheduled(monkeypatch):
    from app.services import faster_whisper_asr as module

    monkeypatch.setattr(
        module,
        "get_faster_whisper_model_status",
        lambda: {
            "model_key": module.FASTER_WHISPER_ASR_MODEL,
            "status": "missing",
            "download_required": True,
            "preparing": False,
            "cached": False,
            "message": "model download required",
            "last_error": "old error",
            "model_dir": "D:/tmp/faster-whisper-medium",
            "missing_files": ["model.bin"],
        },
    )
    monkeypatch.setattr(module, "schedule_faster_whisper_model_prepare", lambda force_refresh=False: True)

    payload = module.prepare_faster_whisper_model()

    assert payload["status"] == "preparing"
    assert payload["preparing"] is True
    assert payload["download_required"] is True
    assert payload["last_error"] == ""


def test_get_or_create_model_uses_settings_snapshot(monkeypatch, tmp_path):
    from app.services import faster_whisper_asr as module

    captured = {}
    model_dir = tmp_path / "faster-whisper-medium"
    model_dir.mkdir(parents=True, exist_ok=True)

    snapshot = module.FasterWhisperSettingsSnapshot(
        device="auto",
        compute_type="",
        cpu_threads=6,
        num_workers=2,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        resolved_device="cuda:0",
        resolved_device_index=0,
        resolved_compute_type="float16",
    )

    class DummyWhisperModel:
        def __init__(self, *args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = dict(kwargs)

    monkeypatch.setattr(module, "_CACHED_MODEL", None)
    monkeypatch.setattr(module, "_CACHED_MODEL_SIGNATURE", "")
    monkeypatch.setattr(module, "FASTER_WHISPER_MODEL_DIR", model_dir)
    monkeypatch.setattr(module, "ensure_faster_whisper_model_downloaded", lambda force_refresh=False: model_dir)
    monkeypatch.setattr(module, "_load_whisper_model_symbol", lambda: DummyWhisperModel)

    module._get_or_create_model(snapshot)

    assert captured["args"][0] == str(model_dir)
    assert captured["kwargs"]["device"] == "cuda"
    assert captured["kwargs"]["device_index"] == 0
    assert captured["kwargs"]["compute_type"] == "float16"
    assert captured["kwargs"]["cpu_threads"] == 6
    assert captured["kwargs"]["num_workers"] == 2


def test_asr_model_routes_report_status_and_prepare(monkeypatch):
    from app.api.routers import asr_models

    app = create_app(enable_lifespan=False)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, email="user@example.com")
    monkeypatch.setattr(asr_models, "get_supported_asr_model_keys", lambda: ("faster-whisper-medium", "qwen3-asr-flash-filetrans"))
    monkeypatch.setattr(
        asr_models,
        "get_asr_model_status",
        lambda _model_key: {
            "model_key": "faster-whisper-medium",
            "display_name": "Bottle 1.0",
            "subtitle": "Higher accuracy, slower than Bottle 2.0.",
            "note": "",
            "runtime_kind": "hybrid_local_cloud",
            "runtime_label": "Desktop Local / Cloud",
            "prepare_mode": "desktop_local_or_cloud",
            "cache_scope": "desktop_and_server",
            "supports_upload": True,
            "supports_preview": False,
            "supports_transcribe_api": True,
            "source_model_id": "pengzhendong/faster-whisper-medium",
            "deploy_path": "/data/modelscope_whisper/faster-whisper-medium",
            "status": "missing",
            "available": False,
            "download_required": True,
            "preparing": False,
            "cached": False,
            "message": "Model download required.",
            "last_error": "",
            "model_dir": "/data/modelscope_whisper/faster-whisper-medium",
            "missing_files": ["model.bin"],
            "actions": [{"key": "prepare", "label": "Prepare", "enabled": True, "primary": True}],
        },
    )
    monkeypatch.setattr(
        asr_models,
        "prepare_registered_asr_model",
        lambda _model_key, force_refresh=False: {
            "model_key": "faster-whisper-medium",
            "display_name": "Bottle 1.0",
            "subtitle": "Higher accuracy, slower than Bottle 2.0.",
            "note": "",
            "runtime_kind": "hybrid_local_cloud",
            "runtime_label": "Desktop Local / Cloud",
            "prepare_mode": "desktop_local_or_cloud",
            "cache_scope": "desktop_and_server",
            "supports_upload": True,
            "supports_preview": False,
            "supports_transcribe_api": True,
            "source_model_id": "pengzhendong/faster-whisper-medium",
            "deploy_path": "/data/modelscope_whisper/faster-whisper-medium",
            "status": "preparing",
            "available": False,
            "download_required": True,
            "preparing": True,
            "cached": False,
            "message": "Preparing model.",
            "last_error": "",
            "model_dir": "/data/modelscope_whisper/faster-whisper-medium",
            "missing_files": ["model.bin"],
            "actions": [{"key": "prepare", "label": "Prepare", "enabled": False, "primary": True}],
        },
    )
    monkeypatch.setattr(
        asr_models,
        "list_asr_models_with_status",
        lambda: [
            {
                "model_key": "faster-whisper-medium",
                "display_name": "Bottle 1.0",
                "subtitle": "Higher accuracy, slower than Bottle 2.0.",
                "note": "",
                "runtime_kind": "hybrid_local_cloud",
                "runtime_label": "Desktop Local / Cloud",
                "prepare_mode": "desktop_local_or_cloud",
                "cache_scope": "desktop_and_server",
                "supports_upload": True,
                "supports_preview": False,
                "supports_transcribe_api": True,
                "source_model_id": "pengzhendong/faster-whisper-medium",
                "deploy_path": "/data/modelscope_whisper/faster-whisper-medium",
                "status": "missing",
                "available": False,
                "download_required": True,
                "preparing": False,
                "cached": False,
                "message": "Model download required.",
                "last_error": "",
                "model_dir": "/data/modelscope_whisper/faster-whisper-medium",
                "missing_files": ["model.bin"],
                "actions": [{"key": "prepare", "label": "Prepare", "enabled": True, "primary": True}],
            },
            {
                "model_key": "qwen3-asr-flash-filetrans",
                "display_name": "Bottle 2.0",
                "subtitle": "Fast cloud transcription.",
                "note": "",
                "runtime_kind": "cloud_api",
                "runtime_label": "Cloud API",
                "prepare_mode": "none",
                "cache_scope": "cloud",
                "supports_upload": True,
                "supports_preview": False,
                "supports_transcribe_api": True,
                "source_model_id": "",
                "deploy_path": "",
                "status": "ready",
                "available": True,
                "download_required": False,
                "preparing": False,
                "cached": False,
                "message": "Cloud API is ready.",
                "last_error": "",
                "model_dir": "",
                "missing_files": [],
                "actions": [{"key": "verify", "label": "Verify", "enabled": True, "primary": False}],
            },
        ],
    )

    with TestClient(app) as client:
        list_resp = client.get("/api/asr-models")
        status_resp = client.get("/api/asr-models/faster-whisper-medium/status")
        prepare_resp = client.post("/api/asr-models/faster-whisper-medium/prepare")
        invalid_resp = client.get("/api/asr-models/sensevoice-small/status")

    assert list_resp.status_code == 200
    assert [item["model_key"] for item in list_resp.json()["models"]] == [
        "faster-whisper-medium",
        "qwen3-asr-flash-filetrans",
    ]
    assert status_resp.status_code == 200
    assert status_resp.json()["display_name"] == "Bottle 1.0"
    assert status_resp.json()["status"] == "missing"
    assert status_resp.json()["download_required"] is True
    assert prepare_resp.status_code == 200
    assert prepare_resp.json()["status"] == "preparing"
    assert prepare_resp.json()["preparing"] is True
    assert invalid_resp.status_code == 400
    assert invalid_resp.json()["detail"]["supported_models"] == ["faster-whisper-medium", "qwen3-asr-flash-filetrans"]


def test_asr_runtime_routes_faster_whisper_model(monkeypatch):
    from app.infra import asr_dashscope

    captured = {}

    def fake_faster_whisper(audio_path: str, *, known_duration_ms=None, progress_callback=None):
        captured["audio_path"] = audio_path
        captured["known_duration_ms"] = known_duration_ms
        captured["progress_callback"] = progress_callback
        return {
            "model": "faster-whisper-medium",
            "task_id": "",
            "task_status": "SUCCEEDED",
            "transcription_url": "",
            "preview_text": "hello from faster whisper",
            "asr_result_json": {"transcripts": [{"text": "hello from faster whisper"}]},
            "usage_seconds": 3,
        }

    monkeypatch.setattr(asr_dashscope, "_transcribe_audio_file_with_faster_whisper", fake_faster_whisper)

    result = asr_dashscope.transcribe_audio_file("demo.opus", model="faster-whisper-medium")
    assert result["model"] == "faster-whisper-medium"
    assert result["preview_text"] == "hello from faster whisper"
    assert captured["audio_path"] == "demo.opus"
