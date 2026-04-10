from __future__ import annotations

import json
from pathlib import Path

from app.core.config import LESSON_WORKSPACE_ROOT_DIR
from app.core.timezone import now_shanghai_naive
from app.models import LessonGenerationTask


WORKSPACE_EVENT_LIMIT = 20
WORKSPACE_SUBTITLE_PREVIEW_LIMIT = 3
TASK_STATUS_SUCCEEDED = "succeeded"


def _copy_dict(value: dict | None) -> dict:
    return dict(value or {})


def _copy_list(value: list | None) -> list:
    return [dict(item) if isinstance(item, dict) else item for item in list(value or [])]


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


def subtitle_cache_seed_runtime(seed: dict | None) -> str:
    return str((seed or {}).get("runtime_kind") or "").strip()


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


def _extract_workspace_subtitle_snapshot(task: LessonGenerationTask, artifacts: dict) -> dict | None:
    subtitle_cache_seed = _copy_dict(task.subtitle_cache_seed_json) if isinstance(task.subtitle_cache_seed_json, dict) else {}
    sentences = [dict(item) for item in list(subtitle_cache_seed.get("sentences") or []) if isinstance(item, dict)]
    if sentences:
        return {
            "kind": "final_subtitle_seed",
            "is_final": True,
            "sentence_count": len(sentences),
            "preview_text": _build_workspace_preview_text(sentences=sentences),
            "items": _build_workspace_draft_items(sentences, is_final=True, source_kind="final_subtitle_seed"),
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }

    def _snapshot_from_payload(payload: dict | None, *, key: str, source_kind: str, transcript_key: str = "") -> dict | None:
        items = list((payload or {}).get("transcripts") or [])
        sentences_local = []
        transcript_text = ""
        if items and isinstance(items[0], dict):
            sentences_local = [dict(item) for item in list(items[0].get("sentences") or []) if isinstance(item, dict)]
            transcript_text = str(items[0].get(transcript_key or "text") or "").strip()
        if not sentences_local and not transcript_text:
            return None
        return {
            "kind": key,
            "is_final": False,
            "sentence_count": len(sentences_local),
            "preview_text": _build_workspace_preview_text(sentences=sentences_local, transcript_text=transcript_text),
            "items": _build_workspace_draft_items(sentences_local, is_final=False, source_kind=source_kind),
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }

    variant_payload = _read_json_file(Path(str(artifacts.get("variant_result_path") or "").strip())) or {}
    variant_sentences = [dict(item) for item in list(variant_payload.get("sentences") or []) if isinstance(item, dict)]
    if variant_sentences:
        return {
            "kind": "variant_result",
            "is_final": False,
            "sentence_count": len(variant_sentences),
            "preview_text": _build_workspace_preview_text(sentences=variant_sentences),
            "items": _build_workspace_draft_items(variant_sentences, is_final=False, source_kind="variant_result"),
            "updated_at": task.updated_at.isoformat() if task.updated_at else now_shanghai_naive().isoformat(),
        }

    asr_raw = _copy_dict(task.asr_raw_json) if isinstance(task.asr_raw_json, dict) else {}
    snapshot = _snapshot_from_payload(asr_raw, key="asr_raw", source_kind="asr_raw")
    if snapshot:
        return snapshot

    asr_payload = _read_json_file(Path(str(artifacts.get("asr_result_path") or "").strip())) or {}
    return _snapshot_from_payload(asr_payload, key="asr_result", source_kind="asr_result")


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
    return {"latest_message": next_event["message"], "events": existing_events[-WORKSPACE_EVENT_LIMIT:]}


def _build_task_workspace_summary(task: LessonGenerationTask) -> dict:
    artifacts = _copy_dict(task.artifacts_json)
    workspace_id = _normalize_workspace_id(task.task_id, task.lesson_id)
    workspace_path = _workspace_summary_path(owner_user_id=int(task.owner_user_id or 0), workspace_id=workspace_id)
    existing_summary = _read_json_file(workspace_path) or {}
    summary = {
        "workspace_id": workspace_id,
        "scope": "lesson" if int(task.lesson_id or 0) > 0 else "task",
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
            "source_duration_ms": int(artifacts.get("source_duration_ms") or 0),
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
        lesson_workspace_path = _workspace_summary_path(
            owner_user_id=int(task.owner_user_id or 0),
            workspace_id=_normalize_workspace_id(None, lesson_id),
        )
        if lesson_workspace_path != workspace_path:
            _write_json_file(lesson_workspace_path, summary)
    return summary


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
    now_iso = now_shanghai_naive().isoformat()
    sentences = [dict(item) for item in list((subtitle_cache_seed or {}).get("sentences") or []) if isinstance(item, dict)]
    summary = {
        "workspace_id": workspace_id,
        "scope": "lesson",
        "owner_user_id": int(owner_user_id or 0),
        "task_id": str(task_id or ""),
        "lesson_id": normalized_lesson_id,
        "created_at": now_iso,
        "updated_at": now_iso,
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
        "restore_pointer": _build_workspace_restore_pointer(task_id=str(task_id or ""), lesson_id=normalized_lesson_id, status=str(status or TASK_STATUS_SUCCEEDED)),
        "latest_subtitle_snapshot": {
            "kind": "final_subtitle_seed",
            "is_final": True,
            "sentence_count": len(sentences),
            "preview_text": _build_workspace_preview_text(sentences=sentences),
            "items": _build_workspace_draft_items(sentences, is_final=True, source_kind="final_subtitle_seed"),
            "updated_at": now_iso,
        }
        if isinstance(subtitle_cache_seed, dict)
        else None,
        "log_summary": {
            "latest_message": str(current_text or "课程生成完成"),
            "events": [{"at": now_iso, "status": str(status or TASK_STATUS_SUCCEEDED), "stage": "write_lesson", "overall_percent": 100, "message": str(current_text or "课程生成完成")}],
        },
    }
    if isinstance(translation_debug, dict):
        summary["translation_debug"] = _copy_dict(translation_debug)
    workspace_path = _workspace_summary_path(owner_user_id=int(owner_user_id or 0), workspace_id=workspace_id)
    _write_json_file(workspace_path, summary)
    lesson_workspace_path = _workspace_summary_path(owner_user_id=int(owner_user_id or 0), workspace_id=_normalize_workspace_id(None, normalized_lesson_id))
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
    next_event = {"at": now_shanghai_naive().isoformat(), "status": "succeeded", "stage": "write_lesson", "overall_percent": 100, "message": str(current_text or "").strip() or "课程已生成完成"}
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
        "current": {"status": "succeeded", "overall_percent": 100, "current_text": next_event["message"], "resume_stage": ""},
        "restore_pointer": _build_workspace_restore_pointer(task_id="", lesson_id=int(lesson_id or 0), status="succeeded"),
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
        "log_summary": {"latest_message": next_event["message"], "events": events[-WORKSPACE_EVENT_LIMIT:]},
    }
    _write_json_file(workspace_path, summary)
    return _sanitize_workspace_summary(summary) or {}
