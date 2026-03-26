from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable
from uuid import uuid4

from sqlalchemy import func, inspect, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import LESSON_WORKSPACE_ROOT_DIR
from app.core.timezone import now_shanghai_naive
from app.db import APP_SCHEMA, SessionLocal
from app.models import LessonGenerationTask, TranslationRequestLog
from app.services.media import cleanup_dir


FAILURE_RETENTION_HOURS = 24
FAILURE_EXCEPTION_TYPE_LIMIT = 120
FAILURE_DETAIL_EXCERPT_LIMIT = 2000
FAILURE_TRACEBACK_EXCERPT_LIMIT = 4000
TASK_CONTROL_ACTIONS: tuple[str, ...] = ("pause", "terminate")
TASK_STATUS_RUNNING = "running"
TASK_STATUS_PAUSING = "pausing"
TASK_STATUS_PAUSED = "paused"
TASK_STATUS_TERMINATING = "terminating"
TASK_STATUS_TERMINATED = "terminated"
TASK_STATUS_PENDING = "pending"
TASK_STATUS_FAILED = "failed"
TASK_STATUS_SUCCEEDED = "succeeded"
TASK_ADMISSION_STATE_NONE = ""
TASK_ADMISSION_STATE_ADMITTED = "admitted"
TASK_ADMISSION_STATE_QUEUED = "queued"
TASK_RESULT_FULL_SUCCESS = "full_success"
TASK_RESULT_ASR_ONLY = "asr_only"
TASK_ACTIVE_CONTROL_STATUSES = {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING}
TASK_TERMINATE_REQUESTABLE_STATUSES = {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING}
ORPHANED_TASK_RECOVERY_MESSAGE = "上次生成已中断，可继续生成或重新开始。"

_STAGE_LABELS: tuple[tuple[str, str], ...] = (
    ("convert_audio", "转换音频格式"),
    ("asr_transcribe", "ASR转写字幕"),
    ("translate_zh", "翻译中文"),
    ("write_lesson", "写入课程"),
)

logger = logging.getLogger(__name__)
_STAGE_LABELS = (
    ("convert_audio", "转换音频格式"),
    ("asr_transcribe", "ASR转写字幕"),
    ("build_lesson", "生成课程结构"),
    ("translate_zh", "翻译中文字幕"),
    ("write_lesson", "写入课程"),
)
LESSON_TASK_REQUIRED_COLUMNS: tuple[str, ...] = tuple(str(column.name) for column in LessonGenerationTask.__table__.columns)
_ACTIVE_TASK_PROBE: Callable[[str], bool] | None = None
_PROCESS_STARTED_AT = now_shanghai_naive()
_TASK_TERMINATE_SIGNALS_LOCK = threading.Lock()
_TASK_TERMINATE_SIGNALS: dict[str, threading.Event] = {}
_TASK_TERMINATE_PATHS: dict[str, set[str]] = {}
_TASK_RUNTIME_CONTEXT = threading.local()
WORKSPACE_EVENT_LIMIT = 20
WORKSPACE_SUBTITLE_PREVIEW_LIMIT = 3


def _is_sqlite_database_locked_error(exc: Exception) -> bool:
    detail = str(exc or "").strip().lower()
    return "database is locked" in detail and "sqlite" in detail


class LessonTaskStorageNotReadyError(Exception):
    code = "DB_MIGRATION_REQUIRED"
    message = "数据库迁移未完成，请先执行 Alembic upgrade head"

    def __init__(self, detail: str):
        self.detail = str(detail or "")
        super().__init__(self.detail or self.message)


def ensure_lesson_task_storage_ready(db: Session) -> None:
    bind = db.get_bind()
    table_name = LessonGenerationTask.__tablename__
    if bind is None:
        detail = "missing database bind for lesson task storage guard"
        logger.warning("[DEBUG] lesson_task_storage.not_ready reason=missing_bind detail=%s", detail)
        raise LessonTaskStorageNotReadyError(detail)

    schema = None if bind.dialect.name == "sqlite" else APP_SCHEMA
    qualified_table = f"{schema}.{table_name}" if schema else table_name
    inspector = inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        detail = f"missing business table: {qualified_table}"
        logger.warning("[DEBUG] lesson_task_storage.not_ready reason=missing_table detail=%s", detail)
        raise LessonTaskStorageNotReadyError(detail)

    existing_columns = {
        str(item.get("name") or "").strip()
        for item in inspector.get_columns(table_name, schema=schema)
    }
    missing_columns = [name for name in LESSON_TASK_REQUIRED_COLUMNS if name not in existing_columns]
    if missing_columns:
        detail = "missing critical columns: " + ", ".join(f"{table_name}.{name}" for name in missing_columns)
        logger.warning("[DEBUG] lesson_task_storage.not_ready reason=missing_columns detail=%s", detail)
        raise LessonTaskStorageNotReadyError(detail)


def _empty_stages() -> list[dict]:
    return [{"key": key, "label": label, "status": "pending"} for key, label in _STAGE_LABELS]


def _empty_counters() -> dict:
    return {
        "asr_done": 0,
        "asr_estimated": 0,
        "translate_done": 0,
        "translate_total": 0,
        "segment_done": 0,
        "segment_total": 0,
    }


def _default_artifacts(
    work_dir: str,
    source_path: str,
    *,
    requested_asr_model: str = "",
    effective_asr_model: str = "",
    model_fallback_applied: bool = False,
    model_fallback_reason: str = "",
) -> dict:
    base = Path(work_dir)
    return {
        "work_dir": work_dir,
        "source_path": source_path,
        "opus_path": str(base / "lesson_input.opus"),
        "asr_result_path": str(base / "asr_result.json"),
        "variant_result_path": str(base / "variant_result.json"),
        "translation_checkpoint_path": str(base / "translation_checkpoint.json"),
        "segment_results_dir": str(base / "asr_segment_results"),
        "lesson_result_path": str(base / "lesson_result.json"),
        "control_action": "",
        "control_requested_at": "",
        "paused_at": "",
        "terminated_at": "",
        "requested_asr_model": str(requested_asr_model or "").strip(),
        "effective_asr_model": str(effective_asr_model or requested_asr_model or "").strip(),
        "model_fallback_applied": bool(model_fallback_applied),
        "model_fallback_reason": str(model_fallback_reason or "").strip(),
        "result_kind": TASK_RESULT_FULL_SUCCESS,
        "result_label": "",
        "result_message": "",
        "partial_failure_stage": "",
        "partial_failure_code": "",
        "partial_failure_message": "",
        "admission_state": "",
        "queue_position": 0,
        "active_task_count": 0,
        "queued_task_count": 0,
        "max_active_tasks": 0,
        "max_queued_tasks": 0,
        "queued_at": "",
    }


def _copy_dict(value: dict | None) -> dict:
    return dict(value or {})


def _copy_list(value: list | None) -> list:
    return [dict(item) if isinstance(item, dict) else item for item in list(value or [])]


def _normalize_dashscope_recovery(value: dict | None) -> dict | None:
    if not isinstance(value, dict):
        return None
    normalized = dict(value)
    normalized["dashscope_file_id"] = str(value.get("dashscope_file_id") or "").strip()
    normalized["first_failure_stage"] = str(value.get("first_failure_stage") or "").strip()
    normalized["first_failure_code"] = str(value.get("first_failure_code") or "").strip()
    normalized["first_failure_message"] = str(value.get("first_failure_message") or "").strip()
    normalized["retry_attempted"] = bool(value.get("retry_attempted"))
    normalized["retry_outcome"] = str(value.get("retry_outcome") or "").strip()
    normalized["final_outcome"] = str(value.get("final_outcome") or "").strip()
    return normalized


def _read_json_file(path: Path | None) -> dict | None:
    candidate = Path(path) if path else None
    if candidate is None or not candidate.exists():
        return None
    try:
        payload = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _write_json_file(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def _trim_text(value: str | None, limit: int) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def _workspace_root_dir() -> Path:
    root_dir = Path(LESSON_WORKSPACE_ROOT_DIR)
    root_dir.mkdir(parents=True, exist_ok=True)
    return root_dir


def _normalize_workspace_id(task_id: str | None = None, lesson_id: int | None = None) -> str:
    normalized_task_id = str(task_id or "").strip()
    if normalized_task_id:
        return normalized_task_id
    normalized_lesson_id = int(lesson_id or 0)
    return f"lesson_{normalized_lesson_id}" if normalized_lesson_id > 0 else ""


def _workspace_summary_path(*, owner_user_id: int, workspace_id: str) -> Path:
    return _workspace_root_dir() / str(max(0, int(owner_user_id or 0))) / f"{workspace_id}.json"


def _build_workspace_preview_text(sentences: list[dict] | None = None, transcript_text: str | None = None) -> str:
    preview_lines: list[str] = []
    for item in list(sentences or []):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text_en") or item.get("text") or "").strip()
        if text:
            preview_lines.append(text)
        if len(preview_lines) >= WORKSPACE_SUBTITLE_PREVIEW_LIMIT:
            break
    if preview_lines:
        return " ".join(preview_lines)
    return _trim_text(str(transcript_text or "").strip(), 280)


def _build_workspace_draft_items(sentences: list[dict] | None, *, is_final: bool, source_kind: str) -> list[dict]:
    draft_items: list[dict] = []
    for index, item in enumerate(list(sentences or [])):
        if not isinstance(item, dict):
            continue
        text_en = str(item.get("text_en") or item.get("text") or "").strip()
        text_zh = str(item.get("text_zh") or "").strip()
        if not text_en and not text_zh:
            continue
        draft_items.append(
            {
                "id": str(item.get("id") or item.get("sentence_id") or item.get("idx") or index),
                "begin_ms": int(item.get("begin_ms") or item.get("begin_time") or 0),
                "end_ms": int(item.get("end_ms") or item.get("end_time") or 0),
                "text_en": text_en,
                "text_zh": text_zh,
                "tokens": [str(token) for token in list(item.get("tokens") or [])],
                "source": source_kind,
                "is_final": bool(is_final),
            }
        )
    return draft_items


def _extract_workspace_subtitle_snapshot(task: LessonGenerationTask, artifacts: dict) -> dict | None:
    subtitle_cache_seed = _copy_dict(task.subtitle_cache_seed_json) if isinstance(task.subtitle_cache_seed_json, dict) else {}
    sentences = [dict(item) for item in list(subtitle_cache_seed.get("sentences") or []) if isinstance(item, dict)]
    if sentences:
        draft_items = _build_workspace_draft_items(sentences, is_final=True, source_kind="final_subtitle_seed")
        return {
            "kind": "final_subtitle_seed",
            "is_final": True,
            "sentence_count": len(sentences),
            "preview_text": _build_workspace_preview_text(sentences=sentences),
            "items": draft_items,
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }

    variant_payload = _read_json_file(Path(str(artifacts.get("variant_result_path") or "").strip())) or {}
    variant_sentences = [dict(item) for item in list(variant_payload.get("sentences") or []) if isinstance(item, dict)]
    if variant_sentences:
        draft_items = _build_workspace_draft_items(variant_sentences, is_final=False, source_kind="variant_result")
        return {
            "kind": "variant_result",
            "is_final": False,
            "sentence_count": len(variant_sentences),
            "preview_text": _build_workspace_preview_text(sentences=variant_sentences),
            "items": draft_items,
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }

    asr_raw = _copy_dict(task.asr_raw_json) if isinstance(task.asr_raw_json, dict) else {}
    raw_transcript_items = list(asr_raw.get("transcripts") or [])
    raw_transcript_sentences = []
    raw_transcript_text = ""
    if raw_transcript_items and isinstance(raw_transcript_items[0], dict):
        raw_transcript_sentences = [dict(item) for item in list(raw_transcript_items[0].get("sentences") or []) if isinstance(item, dict)]
        raw_transcript_text = str(raw_transcript_items[0].get("text") or "").strip()
    if raw_transcript_sentences or raw_transcript_text:
        draft_items = _build_workspace_draft_items(raw_transcript_sentences, is_final=False, source_kind="asr_raw")
        return {
            "kind": "asr_raw",
            "is_final": False,
            "sentence_count": len(raw_transcript_sentences),
            "preview_text": _build_workspace_preview_text(sentences=raw_transcript_sentences, transcript_text=raw_transcript_text),
            "items": draft_items,
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }

    asr_payload = _read_json_file(Path(str(artifacts.get("asr_result_path") or "").strip())) or {}
    transcript_items = list(asr_payload.get("transcripts") or [])
    transcript_sentences = []
    transcript_text = ""
    if transcript_items and isinstance(transcript_items[0], dict):
        transcript_sentences = [dict(item) for item in list(transcript_items[0].get("sentences") or []) if isinstance(item, dict)]
        transcript_text = str(transcript_items[0].get("text") or "").strip()
    if transcript_sentences or transcript_text:
        draft_items = _build_workspace_draft_items(transcript_sentences, is_final=False, source_kind="asr_result")
        return {
            "kind": "asr_result",
            "is_final": False,
            "sentence_count": len(transcript_sentences),
            "preview_text": _build_workspace_preview_text(sentences=transcript_sentences, transcript_text=transcript_text),
            "items": draft_items,
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }
    return None


def _build_workspace_log_event(task: LessonGenerationTask) -> dict:
    stages = _copy_list(task.stages_json)
    current_stage = next((str(item.get("key") or "") for item in stages if str(item.get("status") or "") == "running"), "")
    return {
        "at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        "status": str(task.status or ""),
        "stage": current_stage or str(task.resume_stage or ""),
        "overall_percent": int(task.overall_percent or 0),
        "message": str(task.current_text or task.message or "").strip(),
    }


def _merge_workspace_log_summary(existing_summary: dict | None, task: LessonGenerationTask) -> dict:
    existing_events = list((existing_summary or {}).get("events") or [])
    next_event = _build_workspace_log_event(task)
    if existing_events:
        last_event = existing_events[-1]
        if (
            isinstance(last_event, dict)
            and str(last_event.get("status") or "") == next_event["status"]
            and str(last_event.get("stage") or "") == next_event["stage"]
            and str(last_event.get("message") or "") == next_event["message"]
            and int(last_event.get("overall_percent") or 0) == next_event["overall_percent"]
        ):
            existing_events[-1] = next_event
        else:
            existing_events.append(next_event)
    else:
        existing_events.append(next_event)
    return {
        "latest_message": next_event["message"],
        "events": existing_events[-WORKSPACE_EVENT_LIMIT:],
    }


def _build_workspace_restore_pointer(
    *,
    task_id: str = "",
    lesson_id: int | None = None,
    status: str = "",
    resume_available: bool = False,
    resume_stage: str = "",
) -> dict:
    return {
        "task_id": str(task_id or ""),
        "lesson_id": int(lesson_id or 0) or None,
        "status": str(status or ""),
        "resume_available": bool(resume_available),
        "resume_stage": str(resume_stage or ""),
    }


def _build_task_workspace_summary(task: LessonGenerationTask) -> dict:
    artifacts = _copy_dict(task.artifacts_json)
    workspace_id = _normalize_workspace_id(task.task_id, task.lesson_id)
    workspace_path = _workspace_summary_path(owner_user_id=int(task.owner_user_id or 0), workspace_id=workspace_id)
    existing_summary = _read_json_file(workspace_path) or {}
    source_duration_ms = int(artifacts.get("source_duration_ms") or 0)
    current_scope = "lesson" if int(task.lesson_id or 0) > 0 else "task"
    summary = {
        "workspace_id": workspace_id,
        "scope": current_scope,
        "owner_user_id": int(task.owner_user_id or 0),
        "task_id": str(task.task_id or ""),
        "lesson_id": int(task.lesson_id or 0) or None,
        "created_at": task.created_at.isoformat() if task.created_at else now_shanghai_naive().isoformat(),
        "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        "summary_path": str(workspace_path),
        "source": {
            "source_filename": str(task.source_filename or ""),
            "source_path": str(artifacts.get("source_path") or ""),
            "input_mode": str(artifacts.get("input_mode") or "upload"),
            "runtime_kind": str(artifacts.get("local_runtime_kind") or subtitle_cache_seed_runtime(task.subtitle_cache_seed_json) or ""),
            "source_duration_ms": source_duration_ms,
        },
        "current": {
            "status": str(task.status or ""),
            "overall_percent": int(task.overall_percent or 0),
            "current_text": str(task.current_text or ""),
            "resume_stage": str(task.resume_stage or ""),
        },
        "restore_pointer": _build_workspace_restore_pointer(
            task_id=str(task.task_id or ""),
            lesson_id=int(task.lesson_id or 0) or None,
            status=str(task.status or ""),
            resume_available=bool(task.resume_available),
            resume_stage=str(task.resume_stage or ""),
        ),
        "latest_subtitle_snapshot": _extract_workspace_subtitle_snapshot(task, artifacts),
        "log_summary": _merge_workspace_log_summary(existing_summary.get("log_summary") if isinstance(existing_summary, dict) else None, task),
        "translation_debug": _copy_dict(task.translation_debug_json) if isinstance(task.translation_debug_json, dict) else None,
    }
    _write_json_file(workspace_path, summary)
    lesson_id = int(task.lesson_id or 0)
    if lesson_id > 0:
        lesson_workspace_path = _workspace_summary_path(owner_user_id=int(task.owner_user_id or 0), workspace_id=_normalize_workspace_id(None, lesson_id))
        if lesson_workspace_path != workspace_path:
            _write_json_file(lesson_workspace_path, summary)
    return summary


def subtitle_cache_seed_runtime(seed: dict | None) -> str:
    return str((seed or {}).get("runtime_kind") or "").strip()


def _sync_task_workspace_summary(task: LessonGenerationTask) -> dict:
    summary = _build_task_workspace_summary(task)
    artifacts = _copy_dict(task.artifacts_json)
    artifacts["workspace_id"] = summary["workspace_id"]
    artifacts["workspace_scope"] = summary["scope"]
    artifacts["workspace_summary_path"] = str(
        _workspace_summary_path(owner_user_id=int(task.owner_user_id or 0), workspace_id=summary["workspace_id"])
    )
    task.artifacts_json = artifacts
    return summary


def _sanitize_workspace_summary(summary: dict | None) -> dict | None:
    if not isinstance(summary, dict):
        return None
    payload = dict(summary)
    source = _copy_dict(payload.get("source"))
    source.pop("source_path", None)
    payload["source"] = source or None
    return payload


def _load_workspace_summary_from_artifacts(artifacts: dict | None) -> dict | None:
    summary_path = str((artifacts or {}).get("workspace_summary_path") or "").strip()
    if not summary_path:
        return None
    return _sanitize_workspace_summary(_read_json_file(Path(summary_path)))


def get_lesson_workspace(*, owner_user_id: int, lesson_id: int) -> dict | None:
    normalized_lesson_id = int(lesson_id or 0)
    if normalized_lesson_id <= 0:
        return None
    workspace_path = _workspace_summary_path(
        owner_user_id=int(owner_user_id or 0),
        workspace_id=_normalize_workspace_id(None, normalized_lesson_id),
    )
    return _sanitize_workspace_summary(_read_json_file(workspace_path))


def persist_lesson_workspace_summary(
    *,
    owner_user_id: int,
    lesson_id: int,
    source_filename: str,
    source_duration_ms: int = 0,
    input_mode: str = "local_asr",
    runtime_kind: str = "",
    task_id: str = "",
    status: str = TASK_STATUS_SUCCEEDED,
    current_text: str = "",
    subtitle_cache_seed: dict | None = None,
    translation_debug: dict | None = None,
) -> dict:
    normalized_lesson_id = int(lesson_id or 0)
    if normalized_lesson_id <= 0:
        return {}
    workspace_id = _normalize_workspace_id(task_id, normalized_lesson_id)
    summary = {
        "workspace_id": workspace_id,
        "scope": "lesson",
        "owner_user_id": int(owner_user_id or 0),
        "task_id": str(task_id or ""),
        "lesson_id": normalized_lesson_id,
        "created_at": now_shanghai_naive().isoformat(),
        "updated_at": now_shanghai_naive().isoformat(),
        "summary_path": str(_workspace_summary_path(owner_user_id=int(owner_user_id or 0), workspace_id=workspace_id)),
        "source": {
            "source_filename": str(source_filename or ""),
            "source_path": "",
            "input_mode": str(input_mode or "local_asr"),
            "runtime_kind": str(runtime_kind or subtitle_cache_seed_runtime(subtitle_cache_seed) or "").strip(),
            "source_duration_ms": max(0, int(source_duration_ms or 0)),
        },
        "current": {
            "status": str(status or TASK_STATUS_SUCCEEDED),
            "overall_percent": 100,
            "current_text": str(current_text or "课程生成完成"),
            "resume_stage": "",
        },
        "restore_pointer": _build_workspace_restore_pointer(
            task_id=str(task_id or ""),
            lesson_id=normalized_lesson_id,
            status=str(status or TASK_STATUS_SUCCEEDED),
        ),
        "latest_subtitle_snapshot": {
            "kind": "final_subtitle_seed",
            "is_final": True,
            "sentence_count": len(list((subtitle_cache_seed or {}).get("sentences") or [])),
            "preview_text": _build_workspace_preview_text(
                sentences=[dict(item) for item in list((subtitle_cache_seed or {}).get("sentences") or []) if isinstance(item, dict)]
            ),
            "items": _build_workspace_draft_items(
                [dict(item) for item in list((subtitle_cache_seed or {}).get("sentences") or []) if isinstance(item, dict)],
                is_final=True,
                source_kind="final_subtitle_seed",
            ),
            "updated_at": now_shanghai_naive().isoformat(),
        }
        if isinstance(subtitle_cache_seed, dict)
        else None,
        "log_summary": {
            "latest_message": str(current_text or "课程生成完成"),
            "events": [
                {
                    "at": now_shanghai_naive().isoformat(),
                    "status": str(status or TASK_STATUS_SUCCEEDED),
                    "stage": "write_lesson",
                    "overall_percent": 100,
                    "message": str(current_text or "课程生成完成"),
                }
            ],
        },
    }
    if isinstance(translation_debug, dict):
        summary["translation_debug"] = _copy_dict(translation_debug)
    workspace_path = _workspace_summary_path(owner_user_id=int(owner_user_id or 0), workspace_id=workspace_id)
    _write_json_file(workspace_path, summary)
    lesson_workspace_path = _workspace_summary_path(
        owner_user_id=int(owner_user_id or 0),
        workspace_id=_normalize_workspace_id(None, normalized_lesson_id),
    )
    if lesson_workspace_path != workspace_path:
        _write_json_file(lesson_workspace_path, summary)
    return _sanitize_workspace_summary(summary) or {}


def upsert_lesson_workspace_summary(
    *,
    owner_user_id: int,
    lesson_id: int,
    source_filename: str,
    source_duration_ms: int = 0,
    runtime_kind: str = "",
    subtitle_cache_seed: dict | None = None,
    translation_debug: dict | None = None,
    source_path: str = "",
    current_text: str = "课程已生成完成",
) -> dict:
    workspace_id = _normalize_workspace_id("", lesson_id)
    workspace_path = _workspace_summary_path(owner_user_id=int(owner_user_id or 0), workspace_id=workspace_id)
    existing_summary = _read_json_file(workspace_path) or {}
    subtitle_seed = _copy_dict(subtitle_cache_seed) if isinstance(subtitle_cache_seed, dict) else {}
    subtitle_sentences = [dict(item) for item in list(subtitle_seed.get("sentences") or []) if isinstance(item, dict)]
    next_event = {
        "at": now_shanghai_naive().isoformat(),
        "status": "succeeded",
        "stage": "write_lesson",
        "overall_percent": 100,
        "message": str(current_text or "").strip() or "课程已生成完成",
    }
    events = list((existing_summary.get("log_summary") or {}).get("events") or [])
    events.append(next_event)
    summary = {
        "workspace_id": workspace_id,
        "scope": "lesson",
        "owner_user_id": int(owner_user_id or 0),
        "task_id": "",
        "lesson_id": int(lesson_id or 0),
        "created_at": str(existing_summary.get("created_at") or now_shanghai_naive().isoformat()),
        "updated_at": next_event["at"],
        "summary_path": str(workspace_path),
        "source": {
            "source_filename": str(source_filename or ""),
            "source_path": str(source_path or ""),
            "input_mode": "local_asr_complete",
            "runtime_kind": str(runtime_kind or subtitle_cache_seed_runtime(subtitle_seed) or ""),
            "source_duration_ms": max(0, int(source_duration_ms or 0)),
        },
        "current": {
            "status": "succeeded",
            "overall_percent": 100,
            "current_text": next_event["message"],
            "resume_stage": "",
        },
        "restore_pointer": _build_workspace_restore_pointer(
            task_id="",
            lesson_id=int(lesson_id or 0),
            status="succeeded",
        ),
        "latest_subtitle_snapshot": {
            "kind": "final_subtitle_seed",
            "is_final": True,
            "sentence_count": len(subtitle_sentences),
            "preview_text": _build_workspace_preview_text(sentences=subtitle_sentences),
            "items": _build_workspace_draft_items(subtitle_sentences, is_final=True, source_kind="final_subtitle_seed"),
            "updated_at": next_event["at"],
        }
        if subtitle_sentences
        else None,
        "translation_debug": _copy_dict(translation_debug) if isinstance(translation_debug, dict) else None,
        "log_summary": {
            "latest_message": next_event["message"],
            "events": events[-WORKSPACE_EVENT_LIMIT:],
        },
    }
    _write_json_file(workspace_path, summary)
    return _sanitize_workspace_summary(summary) or {}


def _get_control_action(artifacts: dict | None) -> str:
    action = str((artifacts or {}).get("control_action") or "").strip().lower()
    return action if action in TASK_CONTROL_ACTIONS else ""


def _normalize_admission_state(artifacts: dict | None) -> str:
    state = str((artifacts or {}).get("admission_state") or "").strip().lower()
    if state in {TASK_ADMISSION_STATE_ADMITTED, TASK_ADMISSION_STATE_QUEUED}:
        return state
    return TASK_ADMISSION_STATE_NONE


def _clear_admission_fields(artifacts: dict | None) -> dict:
    next_artifacts = _copy_dict(artifacts)
    next_artifacts["admission_state"] = ""
    next_artifacts["queue_position"] = 0
    next_artifacts["active_task_count"] = 0
    next_artifacts["queued_task_count"] = 0
    next_artifacts["max_active_tasks"] = 0
    next_artifacts["max_queued_tasks"] = 0
    next_artifacts["queued_at"] = ""
    return next_artifacts


def _set_admission_fields(
    artifacts: dict | None,
    *,
    state: str = "",
    queue_position: int = 0,
    active_task_count: int = 0,
    queued_task_count: int = 0,
    max_active_tasks: int = 0,
    max_queued_tasks: int = 0,
    queued_at=None,
) -> dict:
    next_artifacts = _clear_admission_fields(artifacts)
    normalized_state = str(state or "").strip().lower()
    if normalized_state not in {TASK_ADMISSION_STATE_ADMITTED, TASK_ADMISSION_STATE_QUEUED}:
        return next_artifacts
    next_artifacts["admission_state"] = normalized_state
    next_artifacts["queue_position"] = max(0, int(queue_position or 0))
    next_artifacts["active_task_count"] = max(0, int(active_task_count or 0))
    next_artifacts["queued_task_count"] = max(0, int(queued_task_count or 0))
    next_artifacts["max_active_tasks"] = max(0, int(max_active_tasks or 0))
    next_artifacts["max_queued_tasks"] = max(0, int(max_queued_tasks or 0))
    next_artifacts["queued_at"] = queued_at.isoformat() if queued_at else ""
    return next_artifacts


def _clear_control_fields(artifacts: dict | None) -> dict:
    next_artifacts = _copy_dict(artifacts)
    next_artifacts["control_action"] = ""
    next_artifacts["control_requested_at"] = ""
    return next_artifacts


def _set_control_fields(artifacts: dict | None, *, action: str = "", requested_at=None, paused_at=None, terminated_at=None) -> dict:
    next_artifacts = _copy_dict(artifacts)
    normalized_action = action if action in TASK_CONTROL_ACTIONS else ""
    next_artifacts["control_action"] = normalized_action
    next_artifacts["control_requested_at"] = requested_at.isoformat() if requested_at else ""
    if paused_at is not None:
        next_artifacts["paused_at"] = paused_at.isoformat() if paused_at else ""
    if terminated_at is not None:
        next_artifacts["terminated_at"] = terminated_at.isoformat() if terminated_at else ""
    return next_artifacts


def _find_stage(stages: list[dict], stage_key: str) -> dict | None:
    for item in stages:
        if item.get("key") == stage_key:
            return item
    return None


def _infer_resume_stage(stages: list[dict]) -> str:
    for item in stages:
        if str(item.get("status") or "") != "completed":
            return str(item.get("key") or "")
    return ""


def _normalize_result_kind(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == TASK_RESULT_ASR_ONLY:
        return TASK_RESULT_ASR_ONLY
    return TASK_RESULT_FULL_SUCCESS


def _build_result_label(result_kind: str) -> str:
    normalized_kind = _normalize_result_kind(result_kind)
    if normalized_kind == TASK_RESULT_ASR_ONLY:
        return "仅原文字幕"
    return "完整成功"


def _build_result_message(result_kind: str, result_message: str | None = None) -> str:
    normalized_message = str(result_message or "").strip()
    if normalized_message:
        return normalized_message
    normalized_kind = _normalize_result_kind(result_kind)
    if normalized_kind == TASK_RESULT_ASR_ONLY:
        return "课程已生成，翻译失败，可先使用原文字幕学习。"
    return "课程已生成完成"


SessionFactory = Callable[[], Session]


def _session_scope(
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> tuple[Session, bool]:
    if db is not None:
        return db, False
    factory = session_factory or SessionLocal
    return factory(), True


def configure_task_runtime_probe(
    active_task_probe: Callable[[str], bool] | None = None,
    *,
    process_started_at: datetime | None = None,
) -> None:
    global _ACTIVE_TASK_PROBE, _PROCESS_STARTED_AT
    _ACTIVE_TASK_PROBE = active_task_probe
    if process_started_at is not None:
        _PROCESS_STARTED_AT = process_started_at


def _is_task_active_in_current_process(task_id: str) -> bool:
    if _ACTIVE_TASK_PROBE is None:
        return False
    try:
        return bool(_ACTIVE_TASK_PROBE(str(task_id or "")))
    except Exception:
        logger.exception("[DEBUG] lessons.task.active_probe.failed task_id=%s", task_id)
        return False


def _normalize_runtime_path(path: str | Path | None) -> str:
    raw = str(path or "").strip()
    if not raw:
        return ""
    try:
        normalized = Path(raw).expanduser().resolve(strict=False)
    except Exception:
        normalized = Path(raw).expanduser().absolute()
    return str(normalized).replace("\\", "/").rstrip("/").casefold()


def _path_matches_runtime_scope(candidate_path: str, scopes: set[str]) -> bool:
    if not candidate_path:
        return False
    for scope in scopes:
        if candidate_path == scope or candidate_path.startswith(f"{scope}/"):
            return True
    return False


def _ensure_task_terminate_signal(task_id: str) -> threading.Event | None:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return None
    with _TASK_TERMINATE_SIGNALS_LOCK:
        event = _TASK_TERMINATE_SIGNALS.get(normalized_task_id)
        if event is None:
            event = threading.Event()
            _TASK_TERMINATE_SIGNALS[normalized_task_id] = event
        return event


def bind_task_terminate_runtime(task_id: str, *paths: str | Path | None) -> threading.Event | None:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return None
    event = _ensure_task_terminate_signal(normalized_task_id)
    normalized_paths = {path for path in (_normalize_runtime_path(item) for item in paths) if path}
    with _TASK_TERMINATE_SIGNALS_LOCK:
        if normalized_paths:
            _TASK_TERMINATE_PATHS.setdefault(normalized_task_id, set()).update(normalized_paths)
    _TASK_RUNTIME_CONTEXT.task_id = normalized_task_id
    return event


def signal_task_terminate(task_id: str) -> None:
    event = _ensure_task_terminate_signal(task_id)
    if event is not None:
        event.set()


def _resolve_task_terminate_signal(
    task_id: str | None = None,
    *,
    path: str | Path | None = None,
) -> threading.Event | None:
    normalized_task_id = str(task_id or getattr(_TASK_RUNTIME_CONTEXT, "task_id", "") or "").strip()
    normalized_path = _normalize_runtime_path(path)
    with _TASK_TERMINATE_SIGNALS_LOCK:
        if normalized_task_id:
            return _TASK_TERMINATE_SIGNALS.get(normalized_task_id)
        if normalized_path:
            for candidate_task_id, scopes in _TASK_TERMINATE_PATHS.items():
                if _path_matches_runtime_scope(normalized_path, scopes):
                    return _TASK_TERMINATE_SIGNALS.get(candidate_task_id)
    return None


def is_task_terminate_requested(
    task_id: str | None = None,
    *,
    path: str | Path | None = None,
) -> bool:
    event = _resolve_task_terminate_signal(task_id, path=path)
    return bool(event is not None and event.is_set())


def wait_for_task_terminate_request(
    timeout_seconds: float,
    task_id: str | None = None,
    *,
    path: str | Path | None = None,
) -> bool:
    timeout = max(0.0, float(timeout_seconds or 0.0))
    event = _resolve_task_terminate_signal(task_id, path=path)
    if event is None:
        if timeout > 0:
            time.sleep(timeout)
        return False
    return event.wait(timeout)


def clear_task_terminate_runtime(task_id: str) -> None:
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return
    if getattr(_TASK_RUNTIME_CONTEXT, "task_id", "") == normalized_task_id:
        try:
            delattr(_TASK_RUNTIME_CONTEXT, "task_id")
        except AttributeError:
            pass
    with _TASK_TERMINATE_SIGNALS_LOCK:
        _TASK_TERMINATE_SIGNALS.pop(normalized_task_id, None)
        _TASK_TERMINATE_PATHS.pop(normalized_task_id, None)


def _should_recover_orphaned_task(task: LessonGenerationTask) -> bool:
    status = str(task.status or "").strip().lower()
    if status not in TASK_ACTIVE_CONTROL_STATUSES:
        return False
    if status == TASK_STATUS_PENDING and _normalize_admission_state(task.artifacts_json) != TASK_ADMISSION_STATE_ADMITTED:
        return False
    updated_at = task.updated_at
    if updated_at is None or updated_at >= _PROCESS_STARTED_AT:
        return False
    return not _is_task_active_in_current_process(task.task_id)


def _recover_orphaned_task(task: LessonGenerationTask) -> None:
    recovered_at = now_shanghai_naive()
    previous_status = str(task.status or "").strip().lower()
    stages = _copy_list(task.stages_json)
    running_stage = next((item for item in stages if item.get("status") == "running"), None)
    if running_stage:
        running_stage["status"] = "pending"
    resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "convert_audio") or "convert_audio"
    next_artifacts = _clear_admission_fields(
        _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=recovered_at, terminated_at=None)
    )
    next_artifacts["interrupted_recovery_at"] = recovered_at.isoformat()
    next_artifacts["interrupted_recovery_from_status"] = previous_status

    task.stages_json = stages
    task.status = TASK_STATUS_PAUSED
    task.current_text = ORPHANED_TASK_RECOVERY_MESSAGE
    task.message = ""
    task.error_code = ""
    task.failure_debug_json = None
    task.failed_at = None
    task.resume_stage = resume_stage
    task.resume_available = True
    task.artifact_expires_at = None
    task.artifacts_json = next_artifacts


def _recover_orphaned_task_if_needed(task: LessonGenerationTask | None, session: Session) -> LessonGenerationTask | None:
    if task is None or not _should_recover_orphaned_task(task):
        return task
    previous_status = str(task.status or "").strip().lower()
    _recover_orphaned_task(task)
    session.commit()
    session.refresh(task)
    logger.info(
        "[DEBUG] lessons.task.orphan_recovered task_id=%s previous_status=%s resume_stage=%s",
        task.task_id,
        previous_status,
        task.resume_stage,
    )
    return task


def _task_to_dict(task: LessonGenerationTask) -> dict:
    failure_debug = _copy_dict(task.failure_debug_json) if isinstance(task.failure_debug_json, dict) else None
    if failure_debug is not None and task.failed_at is not None and not failure_debug.get("failed_at"):
        failure_debug["failed_at"] = task.failed_at
    asr_raw = _copy_dict(task.asr_raw_json) if isinstance(task.asr_raw_json, dict) else None
    artifacts = _copy_dict(task.artifacts_json)
    status = str(task.status or "")
    control_action = _get_control_action(artifacts)
    if status == TASK_STATUS_SUCCEEDED:
        result_kind = _normalize_result_kind(artifacts.get("result_kind"))
        result_label = _build_result_label(result_kind)
        result_message = _build_result_message(result_kind, artifacts.get("result_message"))
    else:
        result_kind = ""
        result_label = ""
        result_message = ""
    return {
        "task_id": task.task_id,
        "owner_user_id": int(task.owner_user_id),
        "lesson_id": int(task.lesson_id) if task.lesson_id else None,
        "source_filename": task.source_filename,
        "asr_model": task.asr_model,
        "requested_asr_model": str(artifacts.get("requested_asr_model") or task.asr_model or ""),
        "effective_asr_model": str(artifacts.get("effective_asr_model") or task.asr_model or ""),
        "model_fallback_applied": bool(artifacts.get("model_fallback_applied")),
        "model_fallback_reason": str(artifacts.get("model_fallback_reason") or ""),
        "semantic_split_enabled": bool(task.semantic_split_enabled),
        "status": status,
        "overall_percent": int(task.overall_percent or 0),
        "current_text": str(task.current_text or ""),
        "stages": _copy_list(task.stages_json),
        "counters": _copy_dict(task.counters_json),
        "translation_debug": _copy_dict(task.translation_debug_json) if isinstance(task.translation_debug_json, dict) else None,
        "failure_debug": failure_debug,
        "asr_raw": asr_raw,
        "has_raw_debug": bool(asr_raw),
        "subtitle_cache_seed": _copy_dict(task.subtitle_cache_seed_json) if isinstance(task.subtitle_cache_seed_json, dict) else None,
        "workspace": _load_workspace_summary_from_artifacts(artifacts),
        "error_code": str(task.error_code or ""),
        "message": str(task.message or ""),
        "result_kind": result_kind,
        "result_label": result_label,
        "result_message": result_message,
        "partial_failure_stage": str(artifacts.get("partial_failure_stage") or ""),
        "partial_failure_code": str(artifacts.get("partial_failure_code") or ""),
        "partial_failure_message": str(artifacts.get("partial_failure_message") or ""),
        "resume_available": bool(task.resume_available),
        "resume_stage": str(task.resume_stage or ""),
        "artifacts": artifacts,
        "artifact_expires_at": task.artifact_expires_at,
        "failed_at": task.failed_at,
        "raw_debug_purged_at": task.raw_debug_purged_at,
        "control_action": control_action,
        "paused_at": artifacts.get("paused_at") or None,
        "terminated_at": artifacts.get("terminated_at") or None,
        "can_pause": status in {TASK_STATUS_PENDING, TASK_STATUS_RUNNING} and control_action != "terminate",
        "can_terminate": status in {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING, TASK_STATUS_TERMINATING},
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def build_task_id() -> str:
    return f"lesson_task_{uuid4().hex}"


def cleanup_expired_tasks(*, db: Session | None = None, session_factory: SessionFactory | None = None) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        session.expire_all()
        now = now_shanghai_naive()
        items = session.scalars(
            select(LessonGenerationTask).where(
                LessonGenerationTask.artifact_expires_at.is_not(None),
                LessonGenerationTask.artifact_expires_at <= now,
            )
        ).all()
        changed = False
        for task in items:
            work_dir = str(task.work_dir or "").strip()
            if work_dir:
                cleanup_dir(Path(work_dir))
            artifacts = _copy_dict(task.artifacts_json)
            artifacts["cleanup_completed_at"] = now.isoformat()
            task.artifacts_json = artifacts
            task.resume_available = False
            task.artifact_expires_at = None
            changed = True
        if changed:
            session.commit()
    finally:
        if owns_session:
            session.close()


def create_task(
    *,
    task_id: str,
    owner_user_id: int,
    source_filename: str,
    asr_model: str,
    requested_asr_model: str | None = None,
    effective_asr_model: str | None = None,
    model_fallback_applied: bool = False,
    model_fallback_reason: str = "",
    semantic_split_enabled: bool | None,
    work_dir: str,
    source_path: str,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> str:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = LessonGenerationTask(
            task_id=task_id,
            owner_user_id=int(owner_user_id),
            source_filename=source_filename,
            asr_model=asr_model,
            semantic_split_enabled=bool(semantic_split_enabled),
            status=TASK_STATUS_PENDING,
            overall_percent=0,
            current_text="等待处理",
            stages_json=_empty_stages(),
            counters_json=_empty_counters(),
            work_dir=work_dir,
            source_path=source_path,
            artifacts_json=_default_artifacts(
                work_dir,
                source_path,
                requested_asr_model=str(requested_asr_model or asr_model or "").strip(),
                effective_asr_model=str(effective_asr_model or asr_model or "").strip(),
                model_fallback_applied=bool(model_fallback_applied),
                model_fallback_reason=str(model_fallback_reason or "").strip(),
            ),
            failure_debug_json=None,
            asr_raw_json=None,
            resume_available=False,
            resume_stage="convert_audio",
            failed_at=None,
            raw_debug_purged_at=None,
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        _sync_task_workspace_summary(task)
        session.commit()
        return task_id
    finally:
        if owns_session:
            session.close()


def get_task(task_id: str, *, db: Session | None = None, session_factory: SessionFactory | None = None) -> dict | None:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        task = _recover_orphaned_task_if_needed(task, session)
        return _task_to_dict(task) if task else None
    finally:
        if owns_session:
            session.close()


def update_task_progress(
    task_id: str,
    *,
    stage_key: str | None = None,
    stage_status: str | None = None,
    overall_percent: int | None = None,
    current_text: str | None = None,
    counters: dict | None = None,
    translation_debug: dict | None = None,
    asr_raw: dict | None = None,
    artifacts_patch: dict | None = None,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        current_status = str(task.status or "")
        if current_status in {TASK_STATUS_FAILED, TASK_STATUS_SUCCEEDED, TASK_STATUS_TERMINATED}:
            return
        if current_status == TASK_STATUS_PENDING:
            task.status = TASK_STATUS_RUNNING
        stages = _copy_list(task.stages_json)
        if stage_key:
            stage = _find_stage(stages, stage_key)
            if stage:
                stage["status"] = stage_status or stage.get("status") or "pending"
            task.resume_stage = stage_key
        task.stages_json = stages
        if isinstance(overall_percent, int):
            task.overall_percent = max(0, min(100, overall_percent))
        if current_text is not None:
            task.current_text = str(current_text)
        if counters:
            merged = _copy_dict(task.counters_json)
            merged.update(counters)
            task.counters_json = merged
        if translation_debug is not None:
            task.translation_debug_json = dict(translation_debug)
        if asr_raw is not None:
            task.asr_raw_json = dict(asr_raw)
            task.raw_debug_purged_at = None
        merged_artifacts = _copy_dict(task.artifacts_json)
        merged_artifacts["result_kind"] = TASK_RESULT_FULL_SUCCESS
        merged_artifacts["result_label"] = ""
        merged_artifacts["result_message"] = ""
        merged_artifacts["partial_failure_stage"] = ""
        merged_artifacts["partial_failure_code"] = ""
        merged_artifacts["partial_failure_message"] = ""
        if artifacts_patch:
            merged_artifacts.update(artifacts_patch)
        task.artifacts_json = merged_artifacts
        task.failure_debug_json = None
        task.failed_at = None
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.artifact_expires_at = None
        _sync_task_workspace_summary(task)
        session.commit()
    except OperationalError as exc:
        session.rollback()
        if _is_sqlite_database_locked_error(exc):
            logger.warning("[DEBUG] lesson_task.progress_skip reason=sqlite_database_locked task_id=%s", task_id)
            return
        raise
    finally:
        if owns_session:
            session.close()


def patch_task_artifacts(
    task_id: str,
    artifacts_patch: dict,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    if not artifacts_patch:
        return
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        merged_artifacts = _copy_dict(task.artifacts_json)
        merged_artifacts.update(artifacts_patch)
        task.artifacts_json = merged_artifacts
        _sync_task_workspace_summary(task)
        flag_modified(task, "artifacts_json")
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_failed(
    task_id: str,
    *,
    error_code: str,
    message: str,
    exception_type: str = "",
    detail_excerpt: str = "",
    traceback_excerpt: str = "",
    failed_stage: str | None = None,
    translation_debug: dict | None = None,
    dashscope_recovery: dict | None = None,
    resume_available: bool | None = None,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        failed_at = now_shanghai_naive()
        last_progress_text = str(task.current_text or "")
        stages = _copy_list(task.stages_json)
        running_stage = next((item for item in stages if item.get("status") == "running"), None)
        if running_stage:
            running_stage["status"] = "failed"
        resume_stage = str(failed_stage or running_stage.get("key") or "") if running_stage else str(failed_stage or _infer_resume_stage(stages))
        next_translation_debug = dict(translation_debug) if isinstance(translation_debug, dict) else _copy_dict(task.translation_debug_json)
        normalized_dashscope_recovery = _normalize_dashscope_recovery(dashscope_recovery)
        task.stages_json = stages
        task.status = TASK_STATUS_FAILED
        task.translation_debug_json = next_translation_debug or None
        next_failure_debug = {
            "failed_stage": resume_stage,
            "exception_type": _trim_text(exception_type, FAILURE_EXCEPTION_TYPE_LIMIT),
            "detail_excerpt": _trim_text(detail_excerpt, FAILURE_DETAIL_EXCERPT_LIMIT),
            "traceback_excerpt": _trim_text(traceback_excerpt, FAILURE_TRACEBACK_EXCERPT_LIMIT),
            "last_progress_text": _trim_text(last_progress_text, 255),
            "stages": _copy_list(stages),
            "counters": _copy_dict(task.counters_json),
            "translation_debug": next_translation_debug or None,
            "failed_at": failed_at.isoformat(),
        }
        if normalized_dashscope_recovery:
            next_failure_debug["dashscope_recovery"] = normalized_dashscope_recovery
        task.failure_debug_json = next_failure_debug
        task.error_code = error_code
        task.message = message
        task.current_text = message
        task.resume_stage = resume_stage
        task.resume_available = bool(resume_stage) if resume_available is None else bool(resume_available)
        task.failed_at = failed_at
        task.artifact_expires_at = now_shanghai_naive() + timedelta(hours=FAILURE_RETENTION_HOURS)
        next_artifacts = _clear_admission_fields(_clear_control_fields(task.artifacts_json))
        next_artifacts["result_kind"] = ""
        next_artifacts["result_label"] = ""
        next_artifacts["result_message"] = ""
        next_artifacts["partial_failure_stage"] = ""
        next_artifacts["partial_failure_code"] = ""
        next_artifacts["partial_failure_message"] = ""
        if normalized_dashscope_recovery:
            next_artifacts["dashscope_recovery"] = normalized_dashscope_recovery
        task.artifacts_json = next_artifacts
        _sync_task_workspace_summary(task)
        flag_modified(task, "artifacts_json")
        flag_modified(task, "failure_debug_json")
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_succeeded(
    task_id: str,
    *,
    lesson_id: int,
    subtitle_cache_seed: dict | None = None,
    translation_debug: dict | None = None,
    dashscope_recovery: dict | None = None,
    result_kind: str = TASK_RESULT_FULL_SUCCESS,
    result_message: str = "",
    partial_failure_stage: str = "",
    partial_failure_code: str = "",
    partial_failure_message: str = "",
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        stages = _copy_list(task.stages_json)
        normalized_result_kind = _normalize_result_kind(result_kind)
        normalized_partial_stage = str(partial_failure_stage or "").strip()
        normalized_dashscope_recovery = _normalize_dashscope_recovery(dashscope_recovery)
        for stage in stages:
            stage["status"] = "failed" if normalized_partial_stage and stage.get("key") == normalized_partial_stage else "completed"
        task.stages_json = stages
        task.status = TASK_STATUS_SUCCEEDED
        task.lesson_id = int(lesson_id)
        task.overall_percent = 100
        task.current_text = _build_result_message(normalized_result_kind, result_message)
        task.failure_debug_json = None
        task.translation_debug_json = dict(translation_debug) if isinstance(translation_debug, dict) else task.translation_debug_json
        task.subtitle_cache_seed_json = dict(subtitle_cache_seed) if isinstance(subtitle_cache_seed, dict) else None
        task.resume_available = False
        task.resume_stage = ""
        task.artifact_expires_at = now_shanghai_naive() + timedelta(hours=FAILURE_RETENTION_HOURS)
        task.failed_at = None
        next_artifacts = _clear_admission_fields(_clear_control_fields(task.artifacts_json))
        next_artifacts["result_kind"] = normalized_result_kind
        next_artifacts["result_label"] = _build_result_label(normalized_result_kind)
        next_artifacts["result_message"] = _build_result_message(normalized_result_kind, result_message)
        next_artifacts["partial_failure_stage"] = normalized_partial_stage
        next_artifacts["partial_failure_code"] = str(partial_failure_code or "").strip()
        next_artifacts["partial_failure_message"] = str(partial_failure_message or "").strip()
        if normalized_dashscope_recovery:
            next_artifacts["dashscope_recovery"] = normalized_dashscope_recovery
        task.artifacts_json = next_artifacts
        _sync_task_workspace_summary(task)
        flag_modified(task, "artifacts_json")
        session.commit()
    finally:
        if owns_session:
            session.close()


def build_task_debug_report(task: dict) -> str:
    normalized_task = dict(task or {})
    failure_debug = dict(normalized_task.get("failure_debug") or {})
    translation_debug = dict(normalized_task.get("translation_debug") or {})
    counters = dict(normalized_task.get("counters") or {})
    stage_items: list[str] = []
    for item in list(normalized_task.get("stages") or []):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("key") or "").strip()
        status = str(item.get("status") or "").strip() or "pending"
        if label:
            stage_items.append(f"{label}:{status}")
    return "\n".join(
        [
            "请根据下面的任务信息排查素材生成链路：",
            f"task_id: {str(normalized_task.get('task_id') or '').strip()}",
            f"status: {str(normalized_task.get('status') or '').strip()}",
            f"result_kind: {str(normalized_task.get('result_kind') or '').strip() or '无'}",
            f"result_message: {str(normalized_task.get('result_message') or '').strip() or '无'}",
            f"source_filename: {str(normalized_task.get('source_filename') or '').strip()}",
            f"requested_asr_model: {str(normalized_task.get('requested_asr_model') or normalized_task.get('asr_model') or '').strip()}",
            f"effective_asr_model: {str(normalized_task.get('effective_asr_model') or normalized_task.get('asr_model') or '').strip()}",
            f"overall_percent: {int(normalized_task.get('overall_percent') or 0)}%",
            f"stages: {' | '.join(stage_items) if stage_items else '无'}",
            f"failed_stage: {str(normalized_task.get('partial_failure_stage') or failure_debug.get('failed_stage') or '').strip() or '无'}",
            f"error_code: {str(normalized_task.get('partial_failure_code') or normalized_task.get('error_code') or '').strip() or '无'}",
            f"error_message: {str(normalized_task.get('partial_failure_message') or normalized_task.get('message') or '').strip() or '无'}",
            f"last_progress_text: {str(normalized_task.get('current_text') or failure_debug.get('last_progress_text') or '').strip() or '无'}",
            f"asr_progress: {int(counters.get('asr_done', 0) or 0)}/{int(counters.get('asr_estimated', 0) or 0)}",
            f"segment_progress: {int(counters.get('segment_done', 0) or 0)}/{int(counters.get('segment_total', 0) or 0)}",
            f"translate_progress: {int(counters.get('translate_done', 0) or 0)}/{int(counters.get('translate_total', 0) or 0)}",
            f"translation_failed_sentences: {int(translation_debug.get('failed_sentences', 0) or 0)}",
            f"translation_request_count: {int(translation_debug.get('request_count', 0) or 0)}",
            f"translation_latest_error: {str(translation_debug.get('latest_error_summary') or '').strip() or '无'}",
            f"exception_type: {str(failure_debug.get('exception_type') or '').strip() or '无'}",
            f"detail_excerpt: {str(failure_debug.get('detail_excerpt') or '').strip() or '无'}",
            f"lesson_id: {str(normalized_task.get('lesson_id') or '').strip() or '无'}",
            f"created_at: {str(normalized_task.get('created_at') or '').strip() or '无'}",
            f"updated_at: {str(normalized_task.get('updated_at') or '').strip() or '无'}",
        ]
    )


def purge_task_raw_debug(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return None
        purged_at = now_shanghai_naive()
        translation_attempt_count = int(
            session.scalar(select(func.count(TranslationRequestLog.id)).where(TranslationRequestLog.task_id == task_id))
            or 0
        )
        session.execute(
            update(TranslationRequestLog)
            .where(TranslationRequestLog.task_id == task_id)
            .values(raw_request_text="", raw_response_text="", raw_error_text="")
        )
        task.asr_raw_json = None
        task.raw_debug_purged_at = purged_at
        if owns_session:
            session.commit()
        else:
            session.flush()
        return {
            "task_id": task_id,
            "translation_attempt_count": translation_attempt_count,
            "raw_debug_purged_at": purged_at,
        }
    finally:
        if owns_session:
            session.close()


def reset_failed_task_for_restart(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task or str(task.status or "") != TASK_STATUS_FAILED:
            return None
        task.stages_json = _empty_stages()
        task.counters_json = _empty_counters()
        task.translation_debug_json = None
        task.failure_debug_json = None
        task.status = TASK_STATUS_PENDING
        task.overall_percent = 0
        task.current_text = "准备重新生成"
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.resume_stage = "convert_audio"
        task.artifact_expires_at = None
        task.failed_at = None
        task.artifacts_json = _clear_admission_fields(
            _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=None, terminated_at=None)
        )
        _sync_task_workspace_summary(task)
        session.commit()
        session.refresh(task)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()


def reset_task_for_resume(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    cleanup_expired_tasks(db=db, session_factory=session_factory)
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task or not task.resume_available:
            return None
        stages = _copy_list(task.stages_json)
        resume_stage = str(task.resume_stage or _infer_resume_stage(stages))
        reset_from_here = False
        for stage in stages:
            if stage.get("key") == resume_stage:
                reset_from_here = True
            if reset_from_here:
                stage["status"] = "pending"
            elif stage.get("status") != "completed":
                stage["status"] = "pending"
        task.stages_json = stages
        task.status = TASK_STATUS_PENDING
        task.current_text = "准备继续生成"
        task.failure_debug_json = None
        task.error_code = ""
        task.message = ""
        task.resume_available = False
        task.artifact_expires_at = None
        task.failed_at = None
        task.artifacts_json = _clear_admission_fields(
            _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=None, terminated_at=None)
        )
        _sync_task_workspace_summary(task)
        session.commit()
        session.refresh(task)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()


def _apply_waiting_task_control(task: LessonGenerationTask, *, action: str, requested_at: datetime) -> None:
    normalized_action = str(action or "").strip().lower()
    if normalized_action not in TASK_CONTROL_ACTIONS:
        return
    stages = _copy_list(task.stages_json)
    resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "convert_audio") or "convert_audio"
    next_artifacts = _clear_admission_fields(
        _set_control_fields(
            task.artifacts_json,
            action="",
            requested_at=None,
            paused_at=requested_at if normalized_action == "pause" else None,
            terminated_at=requested_at if normalized_action == "terminate" else None,
        )
    )
    task.stages_json = stages
    task.error_code = ""
    task.failure_debug_json = None
    task.failed_at = None
    if normalized_action == "pause":
        task.status = TASK_STATUS_PAUSED
        task.current_text = "已暂停排队，可继续生成"
        task.message = ""
        task.resume_available = bool(resume_stage)
        task.resume_stage = resume_stage
        task.artifact_expires_at = None
    else:
        task.status = TASK_STATUS_TERMINATED
        task.current_text = "已取消排队，素材仍保留"
        task.message = task.current_text
        task.resume_available = False
        task.resume_stage = resume_stage
        task.artifact_expires_at = now_shanghai_naive()
    task.artifacts_json = next_artifacts
    _sync_task_workspace_summary(task)


def request_task_control(
    task_id: str,
    *,
    action: str,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict | None:
    normalized_action = str(action or "").strip().lower()
    if normalized_action not in TASK_CONTROL_ACTIONS:
        return None
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return None
        task = _recover_orphaned_task_if_needed(task, session)
        if not task:
            return None
        status = str(task.status or "").strip().lower()
        requested_at = now_shanghai_naive()
        if status == TASK_STATUS_PENDING and _normalize_admission_state(task.artifacts_json) == TASK_ADMISSION_STATE_QUEUED:
            _apply_waiting_task_control(task, action=normalized_action, requested_at=requested_at)
            session.commit()
            session.refresh(task)
            return _task_to_dict(task)
        if normalized_action == "pause" and status not in {TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_PAUSING}:
            return None
        if normalized_action == "terminate" and status not in TASK_TERMINATE_REQUESTABLE_STATUSES:
            return None
        task.status = TASK_STATUS_PAUSING if normalized_action == "pause" else TASK_STATUS_TERMINATING
        task.current_text = "正在暂停，当前步骤完成后会保留进度" if normalized_action == "pause" else "正在终止，当前步骤完成后会停止生成"
        task.message = ""
        task.error_code = ""
        task.resume_available = False
        task.artifact_expires_at = None
        task.artifacts_json = _set_control_fields(task.artifacts_json, action=normalized_action, requested_at=requested_at)
        _sync_task_workspace_summary(task)
        session.commit()
        session.refresh(task)
        if normalized_action == "terminate" and _is_task_active_in_current_process(task.task_id):
            signal_task_terminate(task.task_id)
        return _task_to_dict(task)
    finally:
        if owns_session:
            session.close()


def request_active_tasks_terminate_for_owner(
    owner_user_id: int,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> dict[str, object]:
    normalized_owner_user_id = int(owner_user_id or 0)
    if normalized_owner_user_id <= 0:
        return {"requested_task_ids": [], "requested_count": 0}
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        tasks = list(
            session.scalars(
                select(LessonGenerationTask)
                .where(
                    LessonGenerationTask.owner_user_id == normalized_owner_user_id,
                    LessonGenerationTask.status.in_(tuple(TASK_TERMINATE_REQUESTABLE_STATUSES)),
                )
                .order_by(LessonGenerationTask.updated_at.desc(), LessonGenerationTask.id.desc())
            ).all()
        )
        requested_task_ids: list[str] = []
        active_requested_task_ids: list[str] = []
        requested_at = now_shanghai_naive()
        for task in tasks:
            task = _recover_orphaned_task_if_needed(task, session)
            if not task:
                continue
            status = str(task.status or "").strip().lower()
            if status not in TASK_TERMINATE_REQUESTABLE_STATUSES:
                continue
            if status == TASK_STATUS_PENDING and _normalize_admission_state(task.artifacts_json) == TASK_ADMISSION_STATE_QUEUED:
                _apply_waiting_task_control(task, action="terminate", requested_at=requested_at)
                requested_task_ids.append(str(task.task_id))
                continue
            task.status = TASK_STATUS_TERMINATING
            task.current_text = "正在终止，当前步骤完成后会停止生成"
            task.message = ""
            task.error_code = ""
            task.resume_available = False
            task.artifact_expires_at = None
            task.artifacts_json = _set_control_fields(task.artifacts_json, action="terminate", requested_at=requested_at)
            task_id = str(task.task_id)
            requested_task_ids.append(task_id)
            if _is_task_active_in_current_process(task_id):
                active_requested_task_ids.append(task_id)
        if requested_task_ids:
            session.commit()
            for task_id in active_requested_task_ids:
                signal_task_terminate(task_id)
        return {"requested_task_ids": requested_task_ids, "requested_count": len(requested_task_ids)}
    finally:
        if owns_session:
            session.close()


def get_task_control_action(
    task_id: str,
    *,
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> str:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return ""
        return _get_control_action(task.artifacts_json)
    finally:
        if owns_session:
            session.close()


def mark_task_paused(
    task_id: str,
    *,
    message: str = "已暂停，可继续生成",
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        paused_at = now_shanghai_naive()
        stages = _copy_list(task.stages_json)
        running_stage = next((item for item in stages if item.get("status") == "running"), None)
        if running_stage:
            running_stage["status"] = "pending"
        resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "")
        task.stages_json = stages
        task.status = TASK_STATUS_PAUSED
        task.current_text = message
        task.message = ""
        task.error_code = ""
        task.failure_debug_json = None
        task.failed_at = None
        task.resume_stage = resume_stage
        task.resume_available = bool(resume_stage)
        task.artifact_expires_at = None
        task.artifacts_json = _clear_admission_fields(
            _set_control_fields(task.artifacts_json, action="", requested_at=None, paused_at=paused_at)
        )
        _sync_task_workspace_summary(task)
        session.commit()
    finally:
        if owns_session:
            session.close()


def mark_task_terminated(
    task_id: str,
    *,
    message: str = "已终止生成，素材仍保留",
    db: Session | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    session, owns_session = _session_scope(db=db, session_factory=session_factory)
    try:
        ensure_lesson_task_storage_ready(session)
        task = session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        if not task:
            return
        terminated_at = now_shanghai_naive()
        stages = _copy_list(task.stages_json)
        running_stage = next((item for item in stages if item.get("status") == "running"), None)
        if running_stage:
            running_stage["status"] = "pending"
        task.stages_json = stages
        task.status = TASK_STATUS_TERMINATED
        task.current_text = message
        task.message = message
        task.error_code = ""
        task.failure_debug_json = None
        task.failed_at = None
        task.resume_available = False
        task.resume_stage = _infer_resume_stage(stages) or str(task.resume_stage or "")
        task.artifact_expires_at = now_shanghai_naive()
        task.artifacts_json = _clear_admission_fields(
            _set_control_fields(task.artifacts_json, action="", requested_at=None, terminated_at=terminated_at)
        )
        _sync_task_workspace_summary(task)
        session.commit()
    finally:
        if owns_session:
            session.close()
