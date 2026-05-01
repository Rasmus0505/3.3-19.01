from __future__ import annotations

from pathlib import Path

from app.services.lessons.recovery_contract import (
    RESUME_MODE_CHECKPOINT,
    RESUME_MODE_RESTART_WITHOUT_UPLOAD,
    RESUME_MODE_UNAVAILABLE,
    build_source_identity,
    derive_resume_plan,
    write_checkpoint,
)


def _default_options(**overrides):
    options = {
        "core_subtitles": True,
        "zh_translation": True,
        "vocabulary_annotation": True,
        "word_explanation": False,
        "forced_alignment": True,
    }
    options.update(overrides)
    return options


def _artifact_paths(work_dir: Path, source_path: Path) -> dict:
    return {
        "work_dir": str(work_dir),
        "source_path": str(source_path),
        "opus_path": str(work_dir / "lesson_input.opus"),
        "asr_result_path": str(work_dir / "asr_result.json"),
        "forced_alignment_path": str(work_dir / "forced_alignment.json"),
        "variant_result_path": str(work_dir / "variant_result.json"),
        "translation_checkpoint_path": str(work_dir / "translation_checkpoint.json"),
        "lesson_result_path": str(work_dir / "lesson_result.json"),
    }


def test_resume_plan_starts_forced_alignment_when_asr_ready_but_alignment_missing(tmp_path: Path):
    work_dir = tmp_path / "task-align"
    work_dir.mkdir()
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"source-bytes" * 200)
    (work_dir / "lesson_input.opus").write_bytes(b"opus-bytes" * 40)
    source_identity = build_source_identity(task_id="task-align", source_path=source_path, source_filename="source.mp4")
    write_checkpoint(
        work_dir / "asr_result.json",
        stage="asr_transcribe",
        source_identity=source_identity,
        payload={"asr_payload": {"transcripts": [{"text": "Hello world", "sentences": [{"text": "Hello world", "begin_time": 0, "end_time": 1000}]}]}},
    )

    plan = derive_resume_plan(
        status="failed",
        task_id="task-align",
        source_filename="source.mp4",
        source_path=source_path,
        work_dir=work_dir,
        artifacts=_artifact_paths(work_dir, source_path),
        generation_options=_default_options(),
    )

    assert plan.available is True
    assert plan.stage == "forced_alignment"
    assert plan.mode == RESUME_MODE_CHECKPOINT


def test_resume_plan_starts_translation_when_variant_exists_but_translation_incomplete(tmp_path: Path):
    work_dir = tmp_path / "task-translate"
    work_dir.mkdir()
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"source-bytes" * 200)
    (work_dir / "lesson_input.opus").write_bytes(b"opus-bytes" * 40)
    source_identity = build_source_identity(task_id="task-translate", source_path=source_path, source_filename="source.mp4")
    write_checkpoint(
        work_dir / "asr_result.json",
        stage="asr_transcribe",
        source_identity=source_identity,
        payload={"asr_payload": {"transcripts": [{"text": "Hello world", "sentences": [{"text": "Hello world", "begin_time": 0, "end_time": 1000}]}]}},
    )
    write_checkpoint(
        work_dir / "forced_alignment.json",
        stage="forced_alignment",
        source_identity=source_identity,
        payload={
            "language": "English",
            "words": [{"text": "Hello", "begin_ms": 0, "end_ms": 400}, {"text": "world", "begin_ms": 420, "end_ms": 900}],
            "sentences": [{"idx": 0, "text": "Hello world", "text_en": "Hello world", "begin_ms": 0, "end_ms": 900, "words": []}],
            "aligned_sentence_indexes": [0],
        },
    )
    write_checkpoint(
        work_dir / "variant_result.json",
        stage="build_lesson",
        source_identity=source_identity,
        payload={
            "split_mode": "asr_provider_sentences",
            "source_word_count": 2,
            "strategy_version": 3,
            "task_id": "task-translate",
            "sentences": [{"idx": 0, "begin_ms": 0, "end_ms": 900, "text_en": "Hello world", "text_zh": "", "tokens": ["hello", "world"], "audio_url": None}],
            "completed_stages": ["build_lesson"],
        },
    )

    plan = derive_resume_plan(
        status="failed",
        task_id="task-translate",
        source_filename="source.mp4",
        source_path=source_path,
        work_dir=work_dir,
        artifacts=_artifact_paths(work_dir, source_path),
        generation_options=_default_options(),
    )

    assert plan.available is True
    assert plan.stage == "translate_zh"
    assert plan.mode == RESUME_MODE_CHECKPOINT


def test_resume_plan_degrades_to_restart_without_upload_when_only_source_exists(tmp_path: Path):
    work_dir = tmp_path / "task-restart"
    work_dir.mkdir()
    source_path = work_dir / "source.mp4"
    source_path.write_bytes(b"source-bytes" * 200)

    plan = derive_resume_plan(
        status="failed",
        task_id="task-restart",
        source_filename="source.mp4",
        source_path=source_path,
        work_dir=work_dir,
        artifacts=_artifact_paths(work_dir, source_path),
        generation_options=_default_options(),
    )

    assert plan.available is True
    assert plan.stage == "convert_audio"
    assert plan.mode == RESUME_MODE_RESTART_WITHOUT_UPLOAD


def test_resume_plan_is_unavailable_when_source_is_missing(tmp_path: Path):
    work_dir = tmp_path / "task-missing"
    work_dir.mkdir()
    source_path = work_dir / "source.mp4"

    plan = derive_resume_plan(
        status="failed",
        task_id="task-missing",
        source_filename="source.mp4",
        source_path=source_path,
        work_dir=work_dir,
        artifacts=_artifact_paths(work_dir, source_path),
        generation_options=_default_options(),
    )

    assert plan.available is False
    assert plan.mode == RESUME_MODE_UNAVAILABLE
