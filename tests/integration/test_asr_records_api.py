from __future__ import annotations

from app.services.asr_dashscope import AsrError
from app.services.media import MediaError


def _build_fake_asr_result(text: str, *, duration_seconds: int = 2) -> dict:
    return {
        "usage_seconds": duration_seconds,
        "asr_result_json": {
            "transcripts": [
                {
                    "text": text,
                    "sentences": [
                        {"text": text, "begin_time": 0, "end_time": duration_seconds * 1000},
                    ],
                }
            ]
        },
    }


def test_asr_record_batch_transcribe_round_trip(authenticated_client, monkeypatch):
    client = authenticated_client

    def fake_transcribe(upload_file, req_dir, model):
        _ = req_dir
        return _build_fake_asr_result(f"{upload_file.filename} => {model}")

    monkeypatch.setattr("app.api.routers.asr_records.transcribe_uploaded_file", fake_transcribe)

    response = client.post(
        "/api/asr-records/transcribe",
        data={
            "model": "qwen3-asr-flash-filetrans",
            "output_mode": "merged",
            "include_timestamps": "false",
            "include_filename_headers": "true",
        },
        files=[
            ("files", ("alpha.mp4", b"alpha-video", "video/mp4")),
            ("files", ("beta.wav", b"beta-audio", "audio/wav")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    record = body["record"]
    assert record["record_status"] == "succeeded"
    assert record["summary"] == {
        "file_count": 2,
        "success_count": 2,
        "failure_count": 0,
        "total_elapsed_ms": record["summary"]["total_elapsed_ms"],
    }
    assert "### alpha.mp4" in record["merged_text"]
    assert "### beta.wav" in record["merged_text"]
    assert len(record["items"]) == 2
    assert record["items"][0]["source_filename"] == "alpha.mp4"
    assert record["items"][1]["source_filename"] == "beta.wav"

    list_response = client.get("/api/asr-records")
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert list_body["ok"] is True
    assert len(list_body["items"]) == 1
    assert list_body["items"][0]["id"] == record["id"]

    detail_response = client.get(f"/api/asr-records/{record['id']}")
    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["id"] == record["id"]
    assert detail_body["items"][0]["rendered_text"].startswith("### alpha.mp4")

    delete_response = client.delete(f"/api/asr-records/{record['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"ok": True, "record_id": record["id"]}

    deleted_detail_response = client.get(f"/api/asr-records/{record['id']}")
    assert deleted_detail_response.status_code == 404


def test_asr_record_batch_transcribe_keeps_partial_failures(authenticated_client, monkeypatch):
    client = authenticated_client

    def fake_transcribe(upload_file, req_dir, model):
        _ = (req_dir, model)
        if upload_file.filename == "broken.mp3":
            raise AsrError("ASR_TASK_FAILED", "broken file")
        return _build_fake_asr_result("usable transcript", duration_seconds=1)

    monkeypatch.setattr("app.api.routers.asr_records.transcribe_uploaded_file", fake_transcribe)

    response = client.post(
        "/api/asr-records/transcribe",
        data={
            "model": "qwen3-asr-flash-filetrans",
            "output_mode": "per_file",
            "include_timestamps": "true",
            "include_filename_headers": "true",
        },
        files=[
            ("files", ("ok.mp3", b"good-audio", "audio/mpeg")),
            ("files", ("broken.mp3", b"bad-audio", "audio/mpeg")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    record = body["record"]
    assert record["record_status"] == "partial"
    assert record["summary"]["file_count"] == 2
    assert record["summary"]["success_count"] == 1
    assert record["summary"]["failure_count"] == 1
    assert len(record["items"]) == 2
    assert record["items"][0]["status"] == "succeeded"
    assert record["items"][0]["rendered_text"].startswith("### ok.mp3")
    assert record["items"][0]["rendered_text"].find("[00:00.000 - 00:01.000]") >= 0
    assert record["items"][1]["status"] == "failed"
    assert record["items"][1]["error_code"] == "ASR_TASK_FAILED"
    assert "识别失败" in record["items"][1]["rendered_text"]


def test_asr_record_batch_transcribe_surfaces_media_extract_failures_for_video(authenticated_client, monkeypatch):
    client = authenticated_client

    def fake_transcribe(upload_file, req_dir, model):
        _ = (upload_file, req_dir, model)
        raise MediaError("FFMPEG_EXTRACT_FAILED", "音频提取失败", "ffmpeg failed")

    monkeypatch.setattr("app.api.routers.asr_records.transcribe_uploaded_file", fake_transcribe)

    response = client.post(
        "/api/asr-records/transcribe",
        data={
            "model": "qwen3-asr-flash-filetrans",
            "output_mode": "per_file",
            "include_timestamps": "false",
            "include_filename_headers": "true",
        },
        files=[
            ("files", ("clip.mp4", b"video-bytes", "video/mp4")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    record = body["record"]
    assert record["record_status"] == "failed"
    assert record["summary"]["file_count"] == 1
    assert record["summary"]["failure_count"] == 1
    assert record["items"][0]["source_filename"] == "clip.mp4"
    assert record["items"][0]["error_code"] == "FFMPEG_EXTRACT_FAILED"
    assert record["items"][0]["error_message"] == "媒体文件已接收，但音轨提取失败"
