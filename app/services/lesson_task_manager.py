from __future__ import annotations

import threading
from datetime import datetime, timezone
from uuid import uuid4


_TASK_LOCK = threading.RLock()
_TASKS: dict[str, dict] = {}

_STAGE_LABELS: tuple[tuple[str, str], ...] = (
    ("convert_audio", "转换音频格式"),
    ("asr_transcribe", "ASR转写字幕"),
    ("translate_zh", "翻译中文"),
    ("write_lesson", "写入课程"),
)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_stages() -> list[dict]:
    return [{"key": key, "label": label, "status": "pending"} for key, label in _STAGE_LABELS]


def _find_stage(task: dict, stage_key: str) -> dict | None:
    for item in task["stages"]:
        if item["key"] == stage_key:
            return item
    return None


def create_task(owner_user_id: int, source_filename: str) -> str:
    task_id = f"lesson_task_{uuid4().hex}"
    with _TASK_LOCK:
        _TASKS[task_id] = {
            "task_id": task_id,
            "owner_user_id": int(owner_user_id),
            "source_filename": source_filename,
            "status": "pending",
            "overall_percent": 0,
            "current_text": "等待处理",
            "stages": _empty_stages(),
            "counters": {
                "asr_done": 0,
                "asr_estimated": 0,
                "translate_done": 0,
                "translate_total": 0,
            },
            "lesson": None,
            "subtitle_cache_seed": None,
            "error_code": "",
            "message": "",
            "created_at": _utc_iso(),
            "updated_at": _utc_iso(),
        }
    return task_id


def get_task(task_id: str) -> dict | None:
    with _TASK_LOCK:
        task = _TASKS.get(task_id)
        if not task:
            return None
        return {
            **task,
            "stages": [dict(item) for item in task.get("stages", [])],
            "counters": dict(task.get("counters", {})),
        }


def update_task_progress(
    task_id: str,
    *,
    stage_key: str | None = None,
    stage_status: str | None = None,
    overall_percent: int | None = None,
    current_text: str | None = None,
    counters: dict | None = None,
) -> None:
    with _TASK_LOCK:
        task = _TASKS.get(task_id)
        if not task:
            return
        if task["status"] == "pending":
            task["status"] = "running"

        if stage_key:
            stage = _find_stage(task, stage_key)
            if stage:
                stage["status"] = stage_status or stage["status"]

        if isinstance(overall_percent, int):
            task["overall_percent"] = max(0, min(100, overall_percent))
        if current_text is not None:
            task["current_text"] = str(current_text)
        if counters:
            task["counters"] = {**task.get("counters", {}), **counters}

        task["updated_at"] = _utc_iso()


def mark_task_failed(task_id: str, *, error_code: str, message: str) -> None:
    with _TASK_LOCK:
        task = _TASKS.get(task_id)
        if not task:
            return
        task["status"] = "failed"
        task["error_code"] = error_code
        task["message"] = message
        task["current_text"] = message
        task["updated_at"] = _utc_iso()


def mark_task_succeeded(task_id: str, *, lesson_payload: dict, subtitle_cache_seed: dict | None = None) -> None:
    with _TASK_LOCK:
        task = _TASKS.get(task_id)
        if not task:
            return
        for stage in task["stages"]:
            if stage["status"] == "pending":
                stage["status"] = "completed"
        task["status"] = "succeeded"
        task["overall_percent"] = 100
        task["lesson"] = lesson_payload
        task["subtitle_cache_seed"] = subtitle_cache_seed
        task["current_text"] = "课程生成完成"
        task["updated_at"] = _utc_iso()
