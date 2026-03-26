from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import lesson_service as lesson_service_module
from app.services.asr_dashscope import AsrError


def test_resolve_dashscope_asr_source_url_prefers_signed_url_lookup(monkeypatch):
    monkeypatch.setattr(
        lesson_service_module,
        "get_file_signed_url",
        lambda file_id: f"https://signed.example.com/{file_id}?token=abc123",
    )

    resolved = lesson_service_module._resolve_dashscope_asr_source_url(
        dashscope_file_id="uploads/20260326/demo.mp4",
        dashscope_file_url="https://oss.example.com/uploads/20260326/demo.mp4",
    )

    assert resolved == "https://signed.example.com/uploads/20260326/demo.mp4?token=abc123"


def test_resolve_dashscope_asr_source_url_falls_back_to_client_url(monkeypatch):
    def fake_get_file_signed_url(_file_id: str) -> str:
        raise AsrError("DASHSCOPE_STORAGE_FILE_GET_FAILED", "查询 DashScope 文件失败", "boom")

    monkeypatch.setattr(lesson_service_module, "get_file_signed_url", fake_get_file_signed_url)

    resolved = lesson_service_module._resolve_dashscope_asr_source_url(
        dashscope_file_id="uploads/20260326/demo.mp4",
        dashscope_file_url="https://oss.example.com/uploads/20260326/demo.mp4",
    )

    assert resolved == "https://oss.example.com/uploads/20260326/demo.mp4"


def test_resolve_dashscope_asr_source_url_raises_without_file_id_or_url():
    with pytest.raises(lesson_service_module.MediaError) as exc_info:
        lesson_service_module._resolve_dashscope_asr_source_url(
            dashscope_file_id="",
            dashscope_file_url="",
        )

    assert exc_info.value.code == "DASHSCOPE_FILE_ID_REQUIRED"


def _build_dashscope_403_error(message: str = "provider denied signed url") -> AsrError:
    return AsrError(
        "ASR_TASK_FAILED",
        "ASR 任务失败",
        json.dumps(
            {
                "task_status": "FAILED",
                "subtask_code": "FILE_403_FORBIDDEN",
                "subtask_message": message,
            },
            ensure_ascii=False,
        ),
    )


def _patch_dashscope_generation_dependencies(monkeypatch, *, build_errors: list[str] | None = None) -> None:
    monkeypatch.setattr(
        lesson_service_module,
        "get_model_rate",
        lambda _db, _model: SimpleNamespace(
            points_per_minute=0,
            price_per_minute_yuan=None,
            points_per_1k_tokens=0,
            segment_seconds=60,
        ),
    )
    monkeypatch.setattr(lesson_service_module, "reserve_points", lambda *_args, **_kwargs: SimpleNamespace(id=1))
    monkeypatch.setattr(lesson_service_module, "record_consume", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(lesson_service_module, "refund_points", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(lesson_service_module, "persist_lesson_workspace_summary", lambda **_kwargs: None)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "build_subtitle_variant",
        staticmethod(
            lambda **_kwargs: {
                "sentences": [
                    {
                        "idx": 0,
                        "begin_ms": 0,
                        "end_ms": 1000,
                        "text_en": "hello world",
                        "text_zh": "你好世界",
                        "tokens": ["hello", "world"],
                        "audio_url": None,
                    }
                ],
                "translation_usage": {"total_tokens": 0},
                "translate_failed_count": 0,
                "translation_request_count": 1,
                "translation_success_request_count": 1,
                "latest_translate_error_summary": "",
            }
        ),
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "build_subtitle_cache_seed",
        staticmethod(
            lambda *, asr_payload, variant: {
                "semantic_split_enabled": False,
                "split_mode": "asr_sentences",
                "source_word_count": 2,
                "strategy_version": 2,
                "asr_payload": asr_payload,
                "sentences": list(variant["sentences"]),
            }
        ),
    )

    def _fake_build_one_lesson(lesson, *, owner_id, asr_payload, variant, db, **_kwargs):
        lesson.id = 321
        lesson.user_id = owner_id
        lesson.title = "dashscope retry lesson"
        lesson.source_filename = "dashscope_403.mp4"
        lesson.asr_model = "qwen3-asr-flash-filetrans"
        lesson.duration_ms = 1000
        lesson.source_duration_ms = 1000
        lesson.media_storage = "client_indexeddb"
        lesson.status = "ready"
        _ = (asr_payload, variant, db)
        return SimpleNamespace(errors=list(build_errors or []))

    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_build_one_lesson",
        staticmethod(_fake_build_one_lesson),
        raising=False,
    )


class _DummyDb:
    def __init__(self) -> None:
        self.commit_calls = 0
        self.rollback_calls = 0

    def scalar(self, *_args, **_kwargs):
        return None

    def get(self, *_args, **_kwargs):
        return None

    def commit(self) -> None:
        self.commit_calls += 1

    def rollback(self) -> None:
        self.rollback_calls += 1

    def refresh(self, _obj) -> None:
        return None


def test_generate_from_dashscope_file_id_dashscope_403_retries_once_and_keeps_canonical_file_id(monkeypatch, tmp_path):
    _patch_dashscope_generation_dependencies(monkeypatch)
    db = _DummyDb()
    req_dir = tmp_path / "dashscope_403_retry_success"
    req_dir.mkdir(parents=True, exist_ok=True)
    signed_url_calls: list[str] = []
    transcribe_calls: list[str] = []

    def fake_get_file_signed_url(file_id: str) -> str:
        signed_url_calls.append(file_id)
        return f"https://signed.example.com/{len(signed_url_calls)}"

    failure = _build_dashscope_403_error("provider denied signed url")

    def fake_transcribe_signed_url(signed_url: str, **_kwargs):
        transcribe_calls.append(signed_url)
        if len(transcribe_calls) == 1:
            raise failure
        return {
            "usage_seconds": 1,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "hello world",
                        "sentences": [{"text": "hello world", "begin_time": 0, "end_time": 1000}],
                    }
                ]
            },
        }

    monkeypatch.setattr(lesson_service_module, "get_file_signed_url", fake_get_file_signed_url)
    monkeypatch.setattr(lesson_service_module, "transcribe_signed_url", fake_transcribe_signed_url)

    lesson = lesson_service_module.LessonService.generate_from_dashscope_file_id(
        dashscope_file_id="uploads/20260326/dashscope_403.mp4",
        dashscope_file_url="https://oss.example.com/uploads/20260326/dashscope_403.mp4",
        source_filename="dashscope_403.mp4",
        req_dir=req_dir,
        owner_id=7,
        asr_model="qwen3-asr-flash-filetrans",
        db=db,
    )

    assert signed_url_calls == [
        "uploads/20260326/dashscope_403.mp4",
        "uploads/20260326/dashscope_403.mp4",
    ]
    assert transcribe_calls == [
        "https://signed.example.com/1",
        "https://signed.example.com/2",
    ]
    assert lesson.task_result_meta["dashscope_recovery"] == {
        "dashscope_file_id": "uploads/20260326/dashscope_403.mp4",
        "first_failure_stage": "asr_transcribe",
        "first_failure_code": "ASR_TASK_FAILED",
        "first_failure_message": "provider denied signed url",
        "retry_attempted": True,
        "retry_outcome": "succeeded",
        "final_outcome": "recovered",
    }


def test_generate_from_dashscope_file_id_dashscope_403_retry_exhaustion_raises_file_access_forbidden(monkeypatch, tmp_path):
    _patch_dashscope_generation_dependencies(monkeypatch)
    db = _DummyDb()
    req_dir = tmp_path / "dashscope_403_retry_failed"
    req_dir.mkdir(parents=True, exist_ok=True)
    signed_url_calls: list[str] = []
    transcribe_calls: list[str] = []

    def fake_get_file_signed_url(file_id: str) -> str:
        signed_url_calls.append(file_id)
        return f"https://signed.example.com/{len(signed_url_calls)}"

    failure = _build_dashscope_403_error("signed url expired twice")

    def fake_transcribe_signed_url(signed_url: str, **_kwargs):
        transcribe_calls.append(signed_url)
        raise failure

    monkeypatch.setattr(lesson_service_module, "get_file_signed_url", fake_get_file_signed_url)
    monkeypatch.setattr(lesson_service_module, "transcribe_signed_url", fake_transcribe_signed_url)

    with pytest.raises(lesson_service_module.AsrError) as exc_info:
        lesson_service_module.LessonService.generate_from_dashscope_file_id(
            dashscope_file_id="uploads/20260326/dashscope_403.mp4",
            dashscope_file_url="https://oss.example.com/uploads/20260326/dashscope_403.mp4",
            source_filename="dashscope_403.mp4",
            req_dir=req_dir,
            owner_id=7,
            asr_model="qwen3-asr-flash-filetrans",
            db=db,
        )

    assert signed_url_calls == [
        "uploads/20260326/dashscope_403.mp4",
        "uploads/20260326/dashscope_403.mp4",
    ]
    assert transcribe_calls == [
        "https://signed.example.com/1",
        "https://signed.example.com/2",
    ]
    assert exc_info.value.code == "DASHSCOPE_FILE_ACCESS_FORBIDDEN"
    assert json.loads(exc_info.value.detail) == {
        "dashscope_file_id": "uploads/20260326/dashscope_403.mp4",
        "first_failure_stage": "asr_transcribe",
        "first_failure_code": "ASR_TASK_FAILED",
        "first_failure_message": "signed url expired twice",
        "retry_attempted": True,
        "retry_outcome": "failed",
        "final_outcome": "cloud_file_access_failed",
    }
