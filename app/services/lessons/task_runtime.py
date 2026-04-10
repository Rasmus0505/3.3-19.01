from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Callable

from app.core.timezone import now_shanghai_naive


logger = logging.getLogger(__name__)

_ACTIVE_TASK_PROBE: Callable[[str], bool] | None = None
_PROCESS_STARTED_AT = now_shanghai_naive()
_TASK_TERMINATE_SIGNALS_LOCK = threading.Lock()
_TASK_TERMINATE_SIGNALS: dict[str, threading.Event] = {}
_TASK_TERMINATE_PATHS: dict[str, set[str]] = {}
_TASK_RUNTIME_CONTEXT = threading.local()


def configure_task_runtime_probe(
    active_task_probe: Callable[[str], bool] | None = None,
    *,
    process_started_at: datetime | None = None,
) -> None:
    global _ACTIVE_TASK_PROBE, _PROCESS_STARTED_AT
    _ACTIVE_TASK_PROBE = active_task_probe
    if process_started_at is not None:
        _PROCESS_STARTED_AT = process_started_at


def get_process_started_at() -> datetime:
    return _PROCESS_STARTED_AT


def is_task_active_in_current_process(task_id: str) -> bool:
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
