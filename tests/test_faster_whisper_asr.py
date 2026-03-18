from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace


def test_ensure_faster_whisper_download_skips_when_cache_ready(tmp_path, monkeypatch):
    from app.services import faster_whisper_asr as module

    model_dir = tmp_path / "faster-whisper-medium"
    model_dir.mkdir(parents=True, exist_ok=True)
    for name in module.FASTER_WHISPER_REQUIRED_FILES:
        (model_dir / name).write_text("ok", encoding="utf-8")

    monkeypatch.setattr(module, "FASTER_WHISPER_MODEL_DIR", model_dir)
    monkeypatch.setattr(module, "FASTER_WHISPER_MODELSCOPE_MODEL_ID", "pengzhendong/faster-whisper-medium")
    monkeypatch.setattr(module, "_load_snapshot_download", lambda: (_ for _ in ()).throw(AssertionError("should not download")))

    assert module.ensure_faster_whisper_model_downloaded(force_refresh=False) == model_dir


def test_transcribe_audio_file_with_faster_whisper_builds_expected_payload(monkeypatch):
    from app.services import faster_whisper_asr as module

    captured = {}

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

    monkeypatch.setattr(module, "_get_or_create_model", lambda: DummyModel())

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
    assert captured["kwargs"]["word_timestamps"] is True
    assert captured["kwargs"]["vad_filter"] is True
    assert progress_events[0]["elapsed_seconds"] == 0
    assert progress_events[-1]["elapsed_seconds"] >= 0


def test_asr_runtime_routes_faster_whisper_model(monkeypatch):
    from app.infra import asr_dashscope

    captured = {}

    def fake_faster_whisper(audio_path: str, *, progress_callback=None):
        captured["audio_path"] = audio_path
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
