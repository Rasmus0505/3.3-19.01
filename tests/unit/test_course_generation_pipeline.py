from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.models.billing import BillingModelRate, WalletAccount
from app.services.course_generation import pipeline
from app.services.course_generation.pipeline import CourseGenerationError, GenerationJobSpec


def _add_rate(db, model_name: str, *, points_per_minute: int = 1, points_per_1k_tokens: int = 0):
    rate = BillingModelRate(
        model_name=model_name,
        price_per_minute_cents_legacy=points_per_minute,
        cost_per_1k_tokens_cents=points_per_1k_tokens,
        price_per_minute_yuan=Decimal("0.0100"),
    )
    db.add(rate)
    db.flush()
    return rate


def _add_wallet(db, user_id: int):
    wallet = WalletAccount(user_id=user_id, balance_amount_cents=10000)
    db.add(wallet)
    db.flush()
    return wallet


def test_pipeline_uses_provider_sentences_without_project_resplitting(monkeypatch, tmp_path: Path, db_session, test_user):
    test_user.collins_level = 3
    _add_wallet(db_session, test_user.id)
    _add_rate(db_session, "stepaudio-2.5-asr")
    _add_rate(db_session, "qwen-mt-flash")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media" * 300)

    monkeypatch.setattr(pipeline, "extract_audio_for_asr", lambda source_path, opus_path: Path(opus_path).write_bytes(b"opus"))
    monkeypatch.setattr(pipeline, "probe_audio_duration_ms", lambda opus_path: 1500)
    monkeypatch.setattr(
        pipeline,
        "transcribe_audio_file",
        lambda *args, **kwargs: {
            "usage_seconds": 2,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "Hello. World.",
                        "sentences": [
                            {"text": "Hello.", "begin_time": 0, "end_time": 500},
                            {"text": "World.", "begin_time": 700, "end_time": 1500},
                        ],
                        "words": [],
                    }
                ]
            },
        },
    )

    def fail_if_called(*args, **kwargs):
        raise AssertionError("project subtitle splitter must not run")

    monkeypatch.setattr(pipeline.LessonService, "build_subtitle_variant", fail_if_called)
    monkeypatch.setattr(pipeline, "DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setattr(
        pipeline,
        "translate_sentences_to_zh",
        lambda texts, **kwargs: SimpleNamespace(
            texts=["你好。", "世界。"],
            failed_count=0,
            attempt_records=[],
            total_requests=1,
            success_request_count=1,
            success_prompt_tokens=1,
            success_completion_tokens=1,
            success_total_tokens=2,
            latest_error_summary="",
        ),
    )

    lesson = pipeline.run_generation_job(
        GenerationJobSpec(
            task_id="task-provider-sentences",
            owner_id=test_user.id,
            source_filename="source.mp4",
            source_path=source,
            work_dir=tmp_path,
            requested_asr_model="stepaudio-2.5-asr",
            effective_asr_model="stepaudio-2.5-asr",
            generation_options={"core_subtitles": True, "zh_translation": True, "vocabulary_annotation": False, "word_explanation": False},
            source_duration_ms=1500,
        ),
        db=db_session,
    )

    assert lesson.media_storage == "server"
    assert lesson.subtitle_cache_seed["split_mode"] == "asr_provider_sentences"
    assert [item["text_en"] for item in lesson.subtitle_cache_seed["sentences"]] == ["Hello.", "World."]
    assert [item["begin_ms"] for item in lesson.subtitle_cache_seed["sentences"]] == [0, 700]


def test_pipeline_reports_invalid_provider_sentence_timestamps(monkeypatch, tmp_path: Path, db_session, test_user):
    _add_wallet(db_session, test_user.id)
    _add_rate(db_session, "stepaudio-2.5-asr")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media" * 300)

    monkeypatch.setattr(pipeline, "extract_audio_for_asr", lambda source_path, opus_path: Path(opus_path).write_bytes(b"opus"))
    monkeypatch.setattr(pipeline, "probe_audio_duration_ms", lambda opus_path: 1500)
    monkeypatch.setattr(
        pipeline,
        "transcribe_audio_file",
        lambda *args, **kwargs: {
            "usage_seconds": 2,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "No timestamps.",
                        "sentences": [{"text": "No timestamps."}],
                        "words": [],
                    }
                ]
            },
        },
    )

    with pytest.raises(CourseGenerationError) as exc_info:
        pipeline.run_generation_job(
            GenerationJobSpec(
                task_id="task-provider-invalid-timestamps",
                owner_id=test_user.id,
                source_filename="source.mp4",
                source_path=source,
                work_dir=tmp_path,
                requested_asr_model="stepaudio-2.5-asr",
                effective_asr_model="stepaudio-2.5-asr",
                generation_options={"core_subtitles": True, "zh_translation": False, "vocabulary_annotation": False, "word_explanation": False},
                source_duration_ms=1500,
            ),
            db=db_session,
        )

    assert exc_info.value.code == "ASR_PROVIDER_SENTENCES_INVALID"
    assert "invalid official timestamps" in exc_info.value.detail


def test_pipeline_strictly_fails_when_duration_missing(monkeypatch, tmp_path: Path, db_session, test_user):
    _add_wallet(db_session, test_user.id)
    _add_rate(db_session, "stepaudio-2.5-asr")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media" * 300)
    monkeypatch.setattr(pipeline, "extract_audio_for_asr", lambda source_path, opus_path: Path(opus_path).write_bytes(b"opus"))
    monkeypatch.setattr(pipeline, "probe_audio_duration_ms", lambda opus_path: 0)

    with pytest.raises(CourseGenerationError) as exc_info:
        pipeline.run_generation_job(
            GenerationJobSpec(
                task_id="task-duration-required",
                owner_id=test_user.id,
                source_filename="source.mp4",
                source_path=source,
                work_dir=tmp_path,
                requested_asr_model="stepaudio-2.5-asr",
                effective_asr_model="stepaudio-2.5-asr",
                generation_options={"core_subtitles": True, "zh_translation": False, "vocabulary_annotation": False, "word_explanation": False},
            ),
            db=db_session,
        )

    assert exc_info.value.code == "MEDIA_DURATION_REQUIRED"


def test_pipeline_uses_forced_alignment_timestamps_when_enabled(monkeypatch, tmp_path: Path, db_session, test_user):
    test_user.collins_level = 3
    _add_wallet(db_session, test_user.id)
    _add_rate(db_session, "stepaudio-2.5-asr")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media" * 300)

    monkeypatch.setattr(pipeline, "extract_audio_for_asr", lambda source_path, opus_path: Path(opus_path).write_bytes(b"opus"))
    monkeypatch.setattr(pipeline, "probe_audio_duration_ms", lambda opus_path: 1500)
    monkeypatch.setattr(
        pipeline,
        "transcribe_audio_file",
        lambda *args, **kwargs: {
            "usage_seconds": 2,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "Hello world",
                        "sentences": [
                            {"text": "Hello world", "begin_time": 0, "end_time": 1500},
                        ],
                        "words": [],
                    }
                ]
            },
        },
    )
    monkeypatch.setattr(
        pipeline,
        "align_transcript_timestamps",
        lambda **kwargs: {
            "language": "English",
            "words": [
                {"text": "Hello", "begin_ms": 120, "end_ms": 400},
                {"text": "world", "begin_ms": 420, "end_ms": 910},
            ],
            "sentences": [
                {"idx": 0, "text": "Hello world", "text_en": "Hello world", "text_zh": "", "tokens": ["hello", "world"], "begin_ms": 120, "end_ms": 910},
            ],
        },
    )

    lesson = pipeline.run_generation_job(
        GenerationJobSpec(
            task_id="task-forced-alignment",
            owner_id=test_user.id,
            source_filename="source.mp4",
            source_path=source,
            work_dir=tmp_path,
            requested_asr_model="stepaudio-2.5-asr",
            effective_asr_model="stepaudio-2.5-asr",
            generation_options={
                "core_subtitles": True,
                "zh_translation": False,
                "vocabulary_annotation": False,
                "word_explanation": False,
                "forced_alignment": True,
            },
            source_duration_ms=1500,
        ),
        db=db_session,
    )

    assert lesson.subtitle_cache_seed["sentences"][0]["begin_ms"] == 120
    assert lesson.subtitle_cache_seed["sentences"][0]["end_ms"] == 910
    assert lesson.subtitle_cache_seed["forced_alignment"]["applied"] is True


def test_pipeline_forced_alignment_uses_provider_word_boundaries_when_whitespace_count_differs(monkeypatch, tmp_path: Path, db_session, test_user):
    test_user.collins_level = 3
    _add_wallet(db_session, test_user.id)
    _add_rate(db_session, "stepaudio-2.5-asr")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media" * 300)

    monkeypatch.setattr(pipeline, "extract_audio_for_asr", lambda source_path, opus_path: Path(opus_path).write_bytes(b"opus"))
    monkeypatch.setattr(pipeline, "probe_audio_duration_ms", lambda opus_path: 1500)
    monkeypatch.setattr(
        pipeline,
        "transcribe_audio_file",
        lambda *args, **kwargs: {
            "usage_seconds": 2,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "Ooh, does it. . .",
                        "sentences": [
                            {
                                "text": "Ooh, does it. . .",
                                "begin_time": 0,
                                "end_time": 1500,
                                "words": [
                                    {"text": "Ooh", "begin_time": 0, "end_time": 300},
                                    {"text": "does", "begin_time": 320, "end_time": 700},
                                    {"text": "it", "begin_time": 710, "end_time": 1000},
                                ],
                            }
                        ],
                        "words": [],
                    }
                ]
            },
        },
    )
    monkeypatch.setattr(
        pipeline,
        "align_transcript_timestamps",
        lambda **kwargs: {
            "language": "English",
            "words": [
                {"text": "Ooh", "begin_ms": 50, "end_ms": 280},
                {"text": "does", "begin_ms": 330, "end_ms": 690},
                {"text": "it", "begin_ms": 720, "end_ms": 970},
            ],
            "sentences": [
                {"idx": 0, "text": "Ooh, does it. . .", "text_en": "Ooh, does it. . .", "text_zh": "", "tokens": ["ooh", "does", "it"], "begin_ms": 50, "end_ms": 970},
            ],
        },
    )

    lesson = pipeline.run_generation_job(
        GenerationJobSpec(
            task_id="task-forced-alignment-provider-words",
            owner_id=test_user.id,
            source_filename="source.mp4",
            source_path=source,
            work_dir=tmp_path,
            requested_asr_model="stepaudio-2.5-asr",
            effective_asr_model="stepaudio-2.5-asr",
            generation_options={
                "core_subtitles": True,
                "zh_translation": False,
                "vocabulary_annotation": False,
                "word_explanation": False,
                "forced_alignment": True,
            },
            source_duration_ms=1500,
        ),
        db=db_session,
    )

    assert lesson.subtitle_cache_seed["sentences"][0]["begin_ms"] == 50
    assert lesson.subtitle_cache_seed["sentences"][0]["end_ms"] == 970


def test_pipeline_forced_alignment_keeps_full_sentence_payload_from_alignment_result():
    from app.services.forced_alignment import _merge_sentence_results

    source_sentences = [
        {"idx": 0, "text": "干。", "text_en": "干。", "begin_ms": 80, "end_ms": 160, "language": "zh", "words": [{"text": "干", "begin_ms": 80, "end_ms": 160}]},
        {"idx": 1, "text": "Do we know anything?", "text_en": "Do we know anything?", "begin_ms": 2412, "end_ms": 2972, "language": "en", "words": [{"text": "Do", "begin_ms": 2412, "end_ms": 2492}]},
    ]
    aligned_sentences = [
        {"idx": 1, "text": "Do we know anything?", "text_en": "Do we know anything?", "text_zh": "", "tokens": ["do", "we", "know", "anything"], "begin_ms": 2410, "end_ms": 2970},
    ]

    merged = _merge_sentence_results(source_sentences=source_sentences, aligned_sentences=aligned_sentences)

    assert merged[0]["text_en"] == "干。"
    assert merged[0]["begin_ms"] == 80
    assert merged[0]["end_ms"] == 160
    assert merged[1]["begin_ms"] == 2410
    assert merged[1]["end_ms"] == 2970


def test_pipeline_reuses_asr_and_forced_alignment_checkpoints_on_retry(monkeypatch, tmp_path: Path, db_session, test_user):
    test_user.collins_level = 3
    _add_wallet(db_session, test_user.id)
    _add_rate(db_session, "stepaudio-2.5-asr")
    _add_rate(db_session, "qwen-mt-flash", points_per_minute=0, points_per_1k_tokens=1)
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media" * 300)

    counters = {"asr": 0, "align": 0, "translate": 0}

    monkeypatch.setattr(pipeline, "extract_audio_for_asr", lambda source_path, opus_path: Path(opus_path).write_bytes(b"opus"))
    monkeypatch.setattr(pipeline, "probe_audio_duration_ms", lambda opus_path: 1500)

    def fake_transcribe(*args, **kwargs):
        counters["asr"] += 1
        return {
            "usage_seconds": 2,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "Hello world",
                        "sentences": [{"text": "Hello world", "begin_time": 0, "end_time": 1500}],
                        "words": [],
                    }
                ]
            },
            "progress_counters": {"segment_done": 1, "segment_total": 1, "asr_done": 1, "asr_estimated": 1},
        }

    def fake_align(**kwargs):
        counters["align"] += 1
        return {
            "language": "English",
            "words": [
                {"text": "Hello", "begin_ms": 120, "end_ms": 400},
                {"text": "world", "begin_ms": 420, "end_ms": 910},
            ],
            "aligned_sentence_indexes": [0],
            "sentences": [
                {"idx": 0, "text": "Hello world", "text_en": "Hello world", "text_zh": "", "tokens": ["hello", "world"], "begin_ms": 120, "end_ms": 910},
            ],
        }

    def fake_translate(texts, **kwargs):
        counters["translate"] += 1
        if counters["translate"] == 1:
            return SimpleNamespace(
                texts=[],
                failed_count=1,
                attempt_records=[],
                total_requests=1,
                success_request_count=0,
                success_prompt_tokens=0,
                success_completion_tokens=0,
                success_total_tokens=0,
                latest_error_summary="temporary failure",
            )
        return SimpleNamespace(
            texts=["你好 世界"],
            failed_count=0,
            attempt_records=[],
            total_requests=1,
            success_request_count=1,
            success_prompt_tokens=1,
            success_completion_tokens=1,
            success_total_tokens=2,
            latest_error_summary="",
        )

    monkeypatch.setattr(pipeline, "transcribe_audio_file", fake_transcribe)
    monkeypatch.setattr(pipeline, "align_transcript_timestamps", fake_align)
    monkeypatch.setattr(pipeline, "DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setattr(pipeline, "translate_sentences_to_zh", fake_translate)

    spec = GenerationJobSpec(
        task_id="task-reuse-checkpoints",
        owner_id=test_user.id,
        source_filename="source.mp4",
        source_path=source,
        work_dir=tmp_path,
        requested_asr_model="stepaudio-2.5-asr",
        effective_asr_model="stepaudio-2.5-asr",
        generation_options={
            "core_subtitles": True,
            "zh_translation": True,
            "vocabulary_annotation": False,
            "word_explanation": False,
            "forced_alignment": True,
        },
        source_duration_ms=1500,
    )

    with pytest.raises(Exception) as exc_info:
        pipeline.run_generation_job(spec, db=db_session)
    assert "翻译阶段失败" in str(exc_info.value)
    assert (tmp_path / "forced_alignment.json").exists()
    assert counters["asr"] == 1
    assert counters["align"] == 1

    lesson = pipeline.run_generation_job(spec, db=db_session)

    assert lesson.subtitle_cache_seed["sentences"][0]["begin_ms"] == 120
    assert counters["asr"] == 1
    assert counters["align"] == 1
    assert counters["translate"] == 2
