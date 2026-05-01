from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.lessons.content_options import normalize_generation_options


CHECKPOINT_SCHEMA_NAME = "lesson_generation_checkpoint"
CHECKPOINT_SCHEMA_VERSION = 1

RESUME_MODE_CHECKPOINT = "checkpoint"
RESUME_MODE_RESTART_WITHOUT_UPLOAD = "restart_without_upload"
RESUME_MODE_UNAVAILABLE = "unavailable"

RECOVERABLE_TASK_STATUSES = {"failed", "paused"}

ARTIFACT_FILE_NAMES = {
    "opus_path": "lesson_input.opus",
    "asr_result_path": "asr_result.json",
    "forced_alignment_path": "forced_alignment.json",
    "variant_result_path": "variant_result.json",
    "translation_checkpoint_path": "translation_checkpoint.json",
    "lesson_result_path": "lesson_result.json",
}


@dataclass(frozen=True)
class ResumePlan:
    available: bool
    stage: str
    mode: str
    source_available: bool
    reason: str = ""


def read_json_file(path: Path | str | None) -> dict[str, Any] | None:
    candidate = Path(path) if path else None
    if candidate is None or not candidate.exists():
        return None
    try:
        payload = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def resolve_artifact_paths(*, artifacts: dict[str, Any] | None = None, work_dir: str | Path | None = None) -> dict[str, Path]:
    normalized_artifacts = dict(artifacts or {})
    base_dir = Path(str(normalized_artifacts.get("work_dir") or work_dir or "")).expanduser()
    return {
        key: Path(str(normalized_artifacts.get(key) or (base_dir / filename))).expanduser()
        for key, filename in ARTIFACT_FILE_NAMES.items()
    }


def build_source_identity(
    *,
    task_id: str,
    source_path: str | Path | None,
    source_filename: str = "",
) -> dict[str, Any]:
    candidate = Path(source_path).expanduser() if source_path else None
    stat = None
    try:
        stat = candidate.stat() if candidate and candidate.exists() else None
    except Exception:
        stat = None
    return {
        "task_id": str(task_id or "").strip(),
        "source_filename": str(source_filename or "").strip(),
        "source_path_name": str(candidate.name if candidate else "").strip(),
        "size_bytes": int(getattr(stat, "st_size", 0) or 0),
        "mtime_ns": int(getattr(stat, "st_mtime_ns", 0) or 0),
    }


def build_checkpoint_payload(
    *,
    stage: str,
    source_identity: dict[str, Any] | None,
    payload: dict[str, Any],
    stage_completed: bool = True,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    checkpoint_payload = {
        "schema_name": CHECKPOINT_SCHEMA_NAME,
        "schema_version": CHECKPOINT_SCHEMA_VERSION,
        "stage_owner": str(stage or "").strip(),
        "checkpoint_complete": True,
        "stage_completed": bool(stage_completed),
        "source_identity": dict(source_identity or {}),
    }
    if extra:
        checkpoint_payload.update(dict(extra))
    checkpoint_payload.update(dict(payload or {}))
    return checkpoint_payload


def write_checkpoint(
    path: Path,
    *,
    stage: str,
    source_identity: dict[str, Any] | None,
    payload: dict[str, Any],
    stage_completed: bool = True,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    checkpoint_payload = build_checkpoint_payload(
        stage=stage,
        source_identity=source_identity,
        payload=payload,
        stage_completed=stage_completed,
        extra=extra,
    )
    write_json_file(path, checkpoint_payload)
    return checkpoint_payload


def source_identity_matches(checkpoint_identity: dict[str, Any] | None, current_identity: dict[str, Any] | None) -> bool:
    expected = dict(checkpoint_identity or {})
    current = dict(current_identity or {})
    if not expected or not current:
        return False
    for key in ("task_id", "source_filename", "source_path_name", "size_bytes", "mtime_ns"):
        if expected.get(key) != current.get(key):
            return False
    return True


def _has_checkpoint_metadata(payload: dict[str, Any] | None) -> bool:
    return isinstance(payload, dict) and "schema_version" in payload


def _checkpoint_metadata_is_compatible(
    payload: dict[str, Any] | None,
    *,
    stage: str,
    current_source_identity: dict[str, Any] | None,
) -> bool:
    if not isinstance(payload, dict):
        return False
    if not _has_checkpoint_metadata(payload):
        return True
    if int(payload.get("schema_version") or 0) != CHECKPOINT_SCHEMA_VERSION:
        return False
    if str(payload.get("schema_name") or CHECKPOINT_SCHEMA_NAME).strip() != CHECKPOINT_SCHEMA_NAME:
        return False
    if str(payload.get("stage_owner") or "").strip() != str(stage or "").strip():
        return False
    if payload.get("checkpoint_complete") is False:
        return False
    checkpoint_source_identity = payload.get("source_identity")
    if checkpoint_source_identity and current_source_identity:
        return source_identity_matches(checkpoint_source_identity, current_source_identity)
    return True


def _extract_asr_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    asr_payload = payload.get("asr_payload")
    if isinstance(asr_payload, dict):
        return asr_payload
    if isinstance(payload.get("transcripts"), list):
        return payload
    return None


def _extract_sentences(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    sentences = list(payload.get("sentences") or [])
    return [dict(item) for item in sentences if isinstance(item, dict)]


def _variant_completed_stages(payload: dict[str, Any] | None, *, generation_options: dict[str, Any] | None = None) -> set[str]:
    if not isinstance(payload, dict):
        return set()
    explicit_completed_stages_present = "completed_stages" in payload
    normalized_generation_options = normalize_generation_options(generation_options)
    completed_stages = {
        str(item).strip()
        for item in list(payload.get("completed_stages") or [])
        if str(item or "").strip()
    }
    sentences = _extract_sentences(payload)
    if sentences:
        completed_stages.add("build_lesson")
        if normalized_generation_options.get("zh_translation") and not explicit_completed_stages_present:
            completed_stages.add("translate_zh")
    if any(item.get("vocabulary_analysis_json") is not None for item in sentences):
        completed_stages.add("vocabulary_annotation")
    if any(
        item.get("explanation_text")
        or item.get("simplified_sentence")
        or item.get("key_explanations_json")
        for item in sentences
    ):
        completed_stages.add("word_explanation")
    return completed_stages


def load_asr_checkpoint(
    path: Path,
    *,
    current_source_identity: dict[str, Any] | None,
) -> dict[str, Any] | None:
    payload = read_json_file(path)
    if not _checkpoint_metadata_is_compatible(payload, stage="asr_transcribe", current_source_identity=current_source_identity):
        return None
    asr_payload = _extract_asr_payload(payload)
    if not isinstance(asr_payload, dict) or not isinstance(asr_payload.get("transcripts"), list):
        return None
    return payload


def load_forced_alignment_checkpoint(
    path: Path,
    *,
    current_source_identity: dict[str, Any] | None,
) -> dict[str, Any] | None:
    payload = read_json_file(path)
    if not _checkpoint_metadata_is_compatible(payload, stage="forced_alignment", current_source_identity=current_source_identity):
        return None
    if not _extract_sentences(payload):
        return None
    return payload


def load_variant_checkpoint(
    path: Path,
    *,
    current_source_identity: dict[str, Any] | None,
) -> dict[str, Any] | None:
    payload = read_json_file(path)
    if not _checkpoint_metadata_is_compatible(payload, stage="build_lesson", current_source_identity=current_source_identity):
        return None
    if not _extract_sentences(payload):
        return None
    return payload


def load_translation_checkpoint(
    path: Path,
    *,
    current_source_identity: dict[str, Any] | None,
) -> dict[str, Any] | None:
    payload = read_json_file(path)
    if not _checkpoint_metadata_is_compatible(payload, stage="translate_zh", current_source_identity=current_source_identity):
        return None
    source_texts = list(payload.get("source_texts") or [])
    translated_texts = list(payload.get("translated_texts") or [])
    completed_indexes = list(payload.get("completed_indexes") or [])
    if not source_texts and not translated_texts and not completed_indexes:
        return None
    return payload


def load_lesson_result_checkpoint(
    path: Path,
    *,
    current_source_identity: dict[str, Any] | None,
) -> dict[str, Any] | None:
    payload = read_json_file(path)
    if not _checkpoint_metadata_is_compatible(payload, stage="write_lesson", current_source_identity=current_source_identity):
        return None
    lesson_id = int(payload.get("lesson_id") or 0)
    if lesson_id <= 0 and not isinstance(payload.get("task_result_meta"), dict):
        return None
    return payload


def _resume_plan(
    *,
    available: bool,
    stage: str,
    mode: str,
    source_available: bool,
    reason: str = "",
) -> ResumePlan:
    return ResumePlan(
        available=bool(available),
        stage=str(stage or "").strip(),
        mode=str(mode or RESUME_MODE_UNAVAILABLE).strip() or RESUME_MODE_UNAVAILABLE,
        source_available=bool(source_available),
        reason=str(reason or "").strip(),
    )


def derive_resume_plan(
    *,
    status: str,
    task_id: str,
    source_filename: str,
    source_path: str | Path | None,
    work_dir: str | Path | None,
    artifacts: dict[str, Any] | None,
    generation_options: dict[str, Any] | None,
) -> ResumePlan:
    normalized_status = str(status or "").strip().lower()
    if normalized_status not in RECOVERABLE_TASK_STATUSES:
        return _resume_plan(
            available=False,
            stage="",
            mode=RESUME_MODE_UNAVAILABLE,
            source_available=Path(source_path).exists() if source_path else False,
            reason=f"status:{normalized_status or 'unknown'}",
        )

    normalized_generation_options = normalize_generation_options(generation_options)
    artifact_paths = resolve_artifact_paths(artifacts=artifacts, work_dir=work_dir)
    current_source_identity = build_source_identity(
        task_id=str(task_id or ""),
        source_path=source_path,
        source_filename=source_filename,
    )
    source_available = bool(source_path and Path(source_path).exists())
    if not source_available:
        return _resume_plan(
            available=False,
            stage="",
            mode=RESUME_MODE_UNAVAILABLE,
            source_available=False,
            reason="source_missing",
        )
    opus_path = artifact_paths["opus_path"]
    has_opus = opus_path.exists() and opus_path.stat().st_size > 0

    asr_checkpoint = load_asr_checkpoint(
        artifact_paths["asr_result_path"],
        current_source_identity=current_source_identity,
    )
    forced_alignment_checkpoint = load_forced_alignment_checkpoint(
        artifact_paths["forced_alignment_path"],
        current_source_identity=current_source_identity,
    )
    variant_checkpoint = load_variant_checkpoint(
        artifact_paths["variant_result_path"],
        current_source_identity=current_source_identity,
    )
    translation_checkpoint = load_translation_checkpoint(
        artifact_paths["translation_checkpoint_path"],
        current_source_identity=current_source_identity,
    )
    lesson_result_checkpoint = load_lesson_result_checkpoint(
        artifact_paths["lesson_result_path"],
        current_source_identity=current_source_identity,
    )

    if lesson_result_checkpoint is not None:
        return _resume_plan(
            available=False,
            stage="",
            mode=RESUME_MODE_UNAVAILABLE,
            source_available=source_available,
            reason="lesson_already_persisted",
        )

    if asr_checkpoint is None:
        if has_opus:
            return _resume_plan(
                available=True,
                stage="asr_transcribe",
                mode=RESUME_MODE_CHECKPOINT,
                source_available=source_available,
                reason="reuse_opus_checkpoint",
            )
        if source_available:
            return _resume_plan(
                available=True,
                stage="convert_audio",
                mode=RESUME_MODE_RESTART_WITHOUT_UPLOAD,
                source_available=True,
                reason="restart_from_source",
            )
        return _resume_plan(
            available=False,
            stage="convert_audio",
            mode=RESUME_MODE_UNAVAILABLE,
            source_available=False,
            reason="source_and_asr_missing",
        )

    if normalized_generation_options.get("forced_alignment") and forced_alignment_checkpoint is None:
        if has_opus:
            return _resume_plan(
                available=True,
                stage="forced_alignment",
                mode=RESUME_MODE_CHECKPOINT,
                source_available=source_available,
                reason="reuse_asr_checkpoint",
            )
        if source_available:
            return _resume_plan(
                available=True,
                stage="convert_audio",
                mode=RESUME_MODE_RESTART_WITHOUT_UPLOAD,
                source_available=True,
                reason="alignment_missing_and_audio_missing",
            )
        return _resume_plan(
            available=False,
            stage="forced_alignment",
            mode=RESUME_MODE_UNAVAILABLE,
            source_available=False,
            reason="alignment_audio_missing",
        )

    completed_variant_stages = _variant_completed_stages(
        variant_checkpoint,
        generation_options=normalized_generation_options,
    )
    if variant_checkpoint is None or "build_lesson" not in completed_variant_stages:
        return _resume_plan(
            available=True,
            stage="build_lesson",
            mode=RESUME_MODE_CHECKPOINT,
            source_available=source_available,
            reason="reuse_sentence_inputs",
        )

    if normalized_generation_options.get("zh_translation") and "translate_zh" not in completed_variant_stages:
        return _resume_plan(
            available=True,
            stage="translate_zh",
            mode=RESUME_MODE_CHECKPOINT,
            source_available=source_available,
            reason="reuse_translation_checkpoint" if translation_checkpoint is not None else "rerun_translation_stage",
        )

    if normalized_generation_options.get("vocabulary_annotation") and "vocabulary_annotation" not in completed_variant_stages:
        return _resume_plan(
            available=True,
            stage="vocabulary_annotation",
            mode=RESUME_MODE_CHECKPOINT,
            source_available=source_available,
            reason="resume_content_enrichment",
        )

    if normalized_generation_options.get("word_explanation") and "word_explanation" not in completed_variant_stages:
        return _resume_plan(
            available=True,
            stage="vocabulary_annotation",
            mode=RESUME_MODE_CHECKPOINT,
            source_available=source_available,
            reason="resume_explanation_enrichment",
        )

    return _resume_plan(
        available=True,
        stage="write_lesson",
        mode=RESUME_MODE_CHECKPOINT,
        source_available=source_available,
        reason="resume_persistence_stage",
    )


__all__ = [
    "ARTIFACT_FILE_NAMES",
    "CHECKPOINT_SCHEMA_NAME",
    "CHECKPOINT_SCHEMA_VERSION",
    "RESUME_MODE_CHECKPOINT",
    "RESUME_MODE_RESTART_WITHOUT_UPLOAD",
    "RESUME_MODE_UNAVAILABLE",
    "ResumePlan",
    "build_checkpoint_payload",
    "build_source_identity",
    "derive_resume_plan",
    "load_asr_checkpoint",
    "load_forced_alignment_checkpoint",
    "load_lesson_result_checkpoint",
    "load_translation_checkpoint",
    "load_variant_checkpoint",
    "read_json_file",
    "resolve_artifact_paths",
    "source_identity_matches",
    "write_checkpoint",
    "write_json_file",
]
