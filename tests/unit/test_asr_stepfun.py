from __future__ import annotations

from pathlib import Path

import pytest

from app.exceptions.asr import AsrError
from app.infra import asr_stepfun
from app.infra import asr_dashscope
from app.services import asr_model_registry


def test_stepfun_transcribe_uses_provider_timestamp_units_without_resplitting(monkeypatch, tmp_path: Path):
    source = tmp_path / "source.opus"
    source.write_bytes(b"demo")

    def fake_convert(audio_path, output_path, *, timeout=300):
        _ = (audio_path, timeout)
        output_path.write_bytes(b"pcm-bytes")

    async def fake_run(pcm_path, **kwargs):
        assert pcm_path.suffix == ".pcm"
        assert kwargs["api_key"] == "test-key"
        return [
            {"type": "session.created"},
            {"type": "session.updated"},
            {"type": "conversation.item.input_audio_transcription.delta", "text": "Hello", "start_time": 0, "end_time": 500},
            {"type": "conversation.item.input_audio_transcription.delta", "text": " world.", "start_time": 600, "end_time": 1200},
            {
                "type": "conversation.item.input_audio_transcription.completed",
                "meta": {"session_id": "stream-1"},
                "transcript": "Hello world.",
            },
        ]

    monkeypatch.setattr(asr_stepfun, "STEPFUN_API_KEY", "test-key")
    monkeypatch.setattr(asr_stepfun, "STEPFUN_ASR_LANGUAGE", "en")
    monkeypatch.setattr(asr_stepfun, "STEPFUN_ASR_ENABLE_ITN", False)
    monkeypatch.setattr(asr_stepfun, "_convert_to_stepfun_pcm", fake_convert)
    monkeypatch.setattr(asr_stepfun, "_run_stepfun_realtime_asr", fake_run)

    result = asr_stepfun.transcribe_audio_file(str(source), known_duration_ms=1200)

    assert result["model"] == asr_stepfun.STEPFUN_ASR_MODEL
    assert result["usage_seconds"] == 2
    assert result["task_id"] == "stream-1"
    transcript = result["asr_result_json"]["transcripts"][0]
    assert transcript["text"] == "Hello world."
    assert transcript["sentences"][0]["begin_time"] == 0
    assert transcript["sentences"][0]["end_time"] == 500
    assert transcript["sentences"][0]["text"] == "Hello"
    assert transcript["sentences"][1]["begin_time"] == 600
    assert transcript["sentences"][1]["end_time"] == 1200
    assert transcript["sentences"][1]["text"] == "world."
    assert transcript["words"][1]["text"] == "world."
    assert result["raw_generate_result"]["stream_model"] == asr_stepfun.STEPFUN_ASR_STREAM_MODEL


def test_stepfun_transcribe_fails_without_official_timestamps(monkeypatch, tmp_path: Path):
    source = tmp_path / "source.opus"
    source.write_bytes(b"demo")

    def fake_convert(audio_path, output_path, *, timeout=300):
        _ = (audio_path, timeout)
        output_path.write_bytes(b"pcm-bytes")

    async def fake_run(pcm_path, **kwargs):
        _ = (pcm_path, kwargs)
        return [{"type": "conversation.item.input_audio_transcription.completed", "transcript": "Hello world"}]

    monkeypatch.setattr(asr_stepfun, "STEPFUN_API_KEY", "test-key")
    monkeypatch.setattr(asr_stepfun, "_convert_to_stepfun_pcm", fake_convert)
    monkeypatch.setattr(asr_stepfun, "_run_stepfun_realtime_asr", fake_run)

    with pytest.raises(AsrError) as exc_info:
        asr_stepfun.transcribe_audio_file(str(source), known_duration_ms=1200)

    assert exc_info.value.code == "ASR_TIMESTAMP_MISSING"


def test_stepfun_session_uses_official_timestamp_stream_model(monkeypatch):
    monkeypatch.setattr(asr_stepfun, "STEPFUN_ASR_LANGUAGE", "en")
    monkeypatch.setattr(asr_stepfun, "STEPFUN_ASR_ENABLE_ITN", False)

    event = asr_stepfun._session_update_event()
    transcription = event["session"]["audio"]["input"]["transcription"]

    assert transcription["model"] == asr_stepfun.STEPFUN_ASR_STREAM_MODEL
    assert transcription["language"] == "en"
    assert transcription["enable_itn"] is False
    assert transcription["full_rerun_on_commit"] is False


def test_dashscope_dispatches_stepfun_model(monkeypatch, tmp_path: Path):
    source = tmp_path / "source.opus"
    source.write_bytes(b"demo")
    captured = {}

    def fake_stepfun(audio_path, **kwargs):
        captured["audio_path"] = audio_path
        captured.update(kwargs)
        return {"asr_result_json": {"transcripts": []}}

    monkeypatch.setattr(asr_dashscope, "_transcribe_audio_file_with_stepfun", fake_stepfun)

    asr_dashscope.transcribe_audio_file(str(source), model=asr_stepfun.STEPFUN_ASR_MODEL, known_duration_ms=1000)

    assert captured["audio_path"] == str(source)
    assert captured["model"] == asr_stepfun.STEPFUN_ASR_MODEL
    assert captured["known_duration_ms"] == 1000


def test_asr_model_registry_lists_stepfun(monkeypatch):
    monkeypatch.setattr(asr_model_registry, "STEPFUN_API_KEY", "test-key")

    assert asr_model_registry.STEPFUN_ASR_MODEL in asr_model_registry.get_supported_upload_asr_model_keys()
    status = asr_model_registry.get_asr_model_status(asr_model_registry.STEPFUN_ASR_MODEL)

    assert status["available"] is True
    assert status["display_name"] == "StepAudio 2.5 ASR"
