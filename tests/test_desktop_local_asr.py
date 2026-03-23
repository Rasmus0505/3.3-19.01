from __future__ import annotations

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
