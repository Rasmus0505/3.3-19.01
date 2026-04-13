"""Lessons schema contract tests."""
from __future__ import annotations

from app.schemas.lesson import (
    LessonCatalogItemResponse,
    LessonCatalogResponse,
    LessonCreateResponse,
    LessonDetailResponse,
    LessonTaskResponse,
)


def test_lesson_catalog_response_schema_contract():
    payload = {
        "ok": True,
        "page": 1,
        "page_size": 20,
        "total": 1,
        "has_more": False,
        "items": [
            {
                "id": 1,
                "title": "Demo lesson",
                "source_filename": "demo.mp4",
                "asr_model": "qwen3-asr-flash-filetrans",
                "duration_ms": 1200,
                "media_storage": "client_indexeddb",
                "source_duration_ms": 1200,
                "status": "ready",
                "created_at": "2026-03-27T00:00:00Z",
                "sentence_count": 3,
                "progress_summary": {
                    "current_sentence_index": 1,
                    "completed_sentence_count": 1,
                    "last_played_at_ms": 900,
                    "updated_at": "2026-03-27T00:05:00Z",
                },
            }
        ],
    }
    parsed = LessonCatalogResponse.model_validate(payload)
    assert parsed.ok is True
    assert len(parsed.items) == 1
    LessonCatalogItemResponse.model_validate(parsed.items[0].model_dump(mode="json"))


def test_lesson_detail_response_schema_contract():
    payload = {
        "ok": True,
        "lesson": {
            "id": 1,
            "title": "Demo lesson",
            "source_filename": "demo.mp4",
            "asr_model": "faster-whisper-medium",
            "duration_ms": 1600,
            "media_storage": "client_indexeddb",
            "source_duration_ms": 1600,
            "status": "ready",
            "created_at": "2026-03-27T00:00:00Z",
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 1600,
                    "text_en": "hello world",
                    "text_zh": "你好 世界",
                    "tokens": ["hello", "world"],
                    "audio_url": None,
                }
            ],
            "subtitle_cache_seed": {
                "semantic_split_enabled": False,
                "split_mode": "asr_sentences",
                "source_word_count": 2,
                "strategy_version": 2,
                "asr_payload": {"transcripts": [{"sentences": [{"text": "hello world"}]}]},
                "sentences": [
                    {
                        "idx": 0,
                        "begin_ms": 0,
                        "end_ms": 1600,
                        "text_en": "hello world",
                        "text_zh": "你好 世界",
                        "tokens": ["hello", "world"],
                        "audio_url": None,
                    }
                ],
            },
        },
    }
    parsed = LessonCreateResponse.model_validate(payload)
    assert parsed.ok is True
    LessonDetailResponse.model_validate(parsed.lesson.model_dump(mode="json"))
    assert parsed.lesson.subtitle_cache_seed is not None
    assert parsed.lesson.subtitle_cache_seed.split_mode == "asr_sentences"


def test_lesson_task_response_schema_contract_for_partial_result():
    payload = {
        "ok": True,
        "task_id": "task-123",
        "requested_asr_model": "qwen3-asr-flash-filetrans",
        "effective_asr_model": "qwen3-asr-flash-filetrans",
        "model_fallback_applied": False,
        "model_fallback_reason": "",
        "completion_kind": "partial",
        "result_kind": "asr_only",
        "result_label": "仅原文字幕",
        "result_message": "课程已生成，翻译失败，可先使用原文字幕学习。",
        "partial_failure_stage": "translate_zh",
        "partial_failure_code": "TRANSLATION_PARTIAL",
        "partial_failure_message": "第2句失败：REQUEST_FAILED rate limit",
        "status": "succeeded",
        "overall_percent": 100,
        "current_text": "课程已生成，翻译失败，可先使用原文字幕学习。",
        "stages": [
            {"key": "asr_transcribe", "label": "ASR转写字幕", "status": "completed"},
            {"key": "translate_zh", "label": "翻译中文", "status": "failed"},
        ],
        "counters": {
            "asr_done": 2,
            "asr_estimated": 2,
            "translate_done": 1,
            "translate_total": 2,
            "segment_done": 0,
            "segment_total": 0,
        },
        "lesson": None,
        "subtitle_cache_seed": None,
        "translation_debug": None,
        "failure_debug": None,
        "error_code": "",
        "message": "课程已生成，翻译失败，可先使用原文字幕学习。",
        "resume_available": False,
        "resume_stage": "",
        "artifact_expires_at": None,
        "control_action": "",
        "paused_at": None,
        "terminated_at": None,
        "can_pause": False,
        "can_terminate": False,
    }
    parsed = LessonTaskResponse.model_validate(payload)
    assert parsed.completion_kind == "partial"
    assert parsed.result_kind == "asr_only"
    assert parsed.partial_failure_stage == "translate_zh"
