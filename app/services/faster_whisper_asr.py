from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.config import (
    FASTER_WHISPER_MODEL_DIR,
    FASTER_WHISPER_MODELSCOPE_MODEL_ID,
    FASTER_WHISPER_PREFETCH_ON_START,
)
from app.core.timezone import now_shanghai_naive
from app.models import FasterWhisperSetting


logger = logging.getLogger(__name__)

FASTER_WHISPER_ASR_MODEL = "faster-whisper-medium"
FASTER_WHISPER_REQUIRED_FILES: tuple[str, ...] = (
    "config.json",
    "configuration.json",
    "model.bin",
    "tokenizer.json",
    "vocabulary.txt",
)
FASTER_WHISPER_META_FILE = ".modelscope_meta.json"
DEFAULT_FASTER_WHISPER_SETTINGS = {
    "device": "auto",
    "compute_type": "",
    "cpu_threads": 4,
    "num_workers": 2,
    "beam_size": 5,
    "vad_filter": True,
    "condition_on_previous_text": False,
}
_FASTER_WHISPER_SETTINGS_REQUIRED_COLUMN_SQL: tuple[tuple[str, str, str], ...] = (
    ("device", "VARCHAR(32) NOT NULL DEFAULT 'auto'", "VARCHAR(32) NOT NULL DEFAULT 'auto'"),
    ("compute_type", "VARCHAR(32) NOT NULL DEFAULT ''", "VARCHAR(32) NOT NULL DEFAULT ''"),
    ("cpu_threads", "INTEGER NOT NULL DEFAULT 4", "INTEGER NOT NULL DEFAULT 4"),
    ("num_workers", "INTEGER NOT NULL DEFAULT 2", "INTEGER NOT NULL DEFAULT 2"),
    ("beam_size", "INTEGER NOT NULL DEFAULT 5", "INTEGER NOT NULL DEFAULT 5"),
    ("vad_filter", "BOOLEAN NOT NULL DEFAULT 1", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("condition_on_previous_text", "BOOLEAN NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("updated_by_user_id", "INTEGER", "INTEGER"),
)

_NON_WORD_EDGE_RE = re.compile(r"^[^\w]+|[^\w]+$")
_MODEL_LOCK = threading.Lock()
_PREFETCH_LOCK = threading.Lock()
_PREFETCH_THREAD: threading.Thread | None = None
_PREPARE_LOCK = threading.Lock()
_PREPARE_THREAD: threading.Thread | None = None
_STATUS_LOCK = threading.Lock()
_DOWNLOAD_IN_PROGRESS = False
_LAST_DOWNLOAD_ERROR = ""
_CACHED_MODEL: Any | None = None
_CACHED_MODEL_SIGNATURE = ""
_CUDA_RUNTIME_ERROR_RE = re.compile(
    r"(cublas|cudnn|cudart|cuda|cupti).*(not found|cannot be loaded|failed to load)|"
    r"(not found|cannot be loaded|failed to load).*(cublas|cudnn|cudart|cuda|cupti)",
    re.IGNORECASE,
)


class FasterWhisperModelNotReadyError(RuntimeError):
    def __init__(self, status_payload: dict[str, Any]):
        self.status_payload = dict(status_payload or {})
        super().__init__(str(self.status_payload.get("message") or "Faster Whisper model is not ready"))


@dataclass(frozen=True)
class FasterWhisperSettingsSnapshot:
    device: str
    compute_type: str
    cpu_threads: int
    num_workers: int
    beam_size: int
    vad_filter: bool
    condition_on_previous_text: bool
    resolved_device: str
    resolved_device_index: int
    resolved_compute_type: str


def _faster_whisper_settings_schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return FasterWhisperSetting.__table__.schema


def _qualified_faster_whisper_settings_table(db: Session) -> str:
    schema = _faster_whisper_settings_schema_name(db)
    return f"{schema}.{FasterWhisperSetting.__tablename__}" if schema else FasterWhisperSetting.__tablename__


def _faster_whisper_settings_column_names(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    schema = _faster_whisper_settings_schema_name(db)
    inspector = inspect(bind)
    if not inspector.has_table(FasterWhisperSetting.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(FasterWhisperSetting.__tablename__, schema=schema)}


def _ensure_faster_whisper_settings_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("faster_whisper_settings schema repair missing bind")

    schema = _faster_whisper_settings_schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(FasterWhisperSetting.__tablename__, schema=schema):
        FasterWhisperSetting.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    existing_columns = _faster_whisper_settings_column_names(db)
    table_name = _qualified_faster_whisper_settings_table(db)
    dialect_name = bind.dialect.name
    missing_columns = [item for item in _FASTER_WHISPER_SETTINGS_REQUIRED_COLUMN_SQL if item[0] not in existing_columns]
    for column_name, sqlite_sql, default_sql in missing_columns:
        column_sql = sqlite_sql if dialect_name == "sqlite" else default_sql
        db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
        changed = True
    if missing_columns:
        db.commit()

    if _backfill_faster_whisper_settings_values(db):
        changed = True
    return changed


def _backfill_faster_whisper_settings_values(db: Session) -> bool:
    table_name = _qualified_faster_whisper_settings_table(db)
    column_names = _faster_whisper_settings_column_names(db)
    if not column_names:
        return False

    dialect_name = str((db.get_bind().dialect.name if db.get_bind() is not None else "") or "").lower()
    changed = False
    for column_name, default_value in DEFAULT_FASTER_WHISPER_SETTINGS.items():
        if column_name not in column_names:
            continue
        if isinstance(default_value, bool):
            update_sql = text(f"UPDATE {table_name} SET {column_name} = :default_value WHERE {column_name} IS NULL")
            params = {"default_value": int(default_value) if dialect_name == "sqlite" else bool(default_value)}
        elif isinstance(default_value, int):
            update_sql = text(
                f"UPDATE {table_name} SET {column_name} = {int(default_value)} "
                f"WHERE {column_name} IS NULL OR {column_name} <= 0"
            )
            params = None
        else:
            update_sql = text(f"UPDATE {table_name} SET {column_name} = :default_value WHERE {column_name} IS NULL")
            params = {"default_value": str(default_value or "")}
        result = db.execute(update_sql, params or {})
        changed = changed or bool(getattr(result, "rowcount", 0))

    if "updated_at" in column_names:
        result = db.execute(text(f"UPDATE {table_name} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
        changed = changed or bool(getattr(result, "rowcount", 0))

    if changed:
        db.commit()
    return changed


def _normalize_faster_whisper_settings_row(row: FasterWhisperSetting) -> bool:
    changed = False
    for key, value in DEFAULT_FASTER_WHISPER_SETTINGS.items():
        current = getattr(row, key)
        if isinstance(value, bool):
            if current is None:
                setattr(row, key, value)
                changed = True
            continue
        if isinstance(value, int):
            if current in (None, "") or int(current) <= 0:
                setattr(row, key, value)
                changed = True
            continue
        normalized_value = str(current or "").strip()
        if normalized_value != str(current or ""):
            setattr(row, key, normalized_value)
            changed = True
    if getattr(row, "updated_at", None) is None:
        row.updated_at = now_shanghai_naive()
        changed = True
    return changed


def ensure_default_faster_whisper_settings(db: Session) -> FasterWhisperSetting:
    _ensure_faster_whisper_settings_schema(db)
    row = db.get(FasterWhisperSetting, 1)
    if row is None:
        row = FasterWhisperSetting(id=1, **DEFAULT_FASTER_WHISPER_SETTINGS)
        db.add(row)
        db.commit()
        db.refresh(row)
    elif _normalize_faster_whisper_settings_row(row):
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_faster_whisper_settings(db: Session) -> FasterWhisperSetting:
    _ensure_faster_whisper_settings_schema(db)
    row = db.get(FasterWhisperSetting, 1)
    if row is None:
        row = ensure_default_faster_whisper_settings(db)
    elif _normalize_faster_whisper_settings_row(row):
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _load_ctranslate2_symbols():
    try:
        import ctranslate2
    except Exception as exc:  # pragma: no cover - import depends on runtime env
        raise RuntimeError(f"ctranslate2 import failed: {str(exc)[:400]}") from exc
    return ctranslate2


def _cuda_available() -> bool:
    try:
        ctranslate2 = _load_ctranslate2_symbols()
        return int(ctranslate2.get_cuda_device_count()) > 0
    except Exception:
        return False


def _resolve_model_device(raw_device: str) -> tuple[str, int, str]:
    normalized = str(raw_device or "").strip().lower()
    if not normalized or normalized == "auto":
        if _cuda_available():
            return "cuda", 0, "cuda:0"
        return "cpu", 0, "cpu"
    if normalized.startswith("cuda"):
        if ":" in normalized:
            _, _, raw_index = normalized.partition(":")
            try:
                return "cuda", max(0, int(raw_index)), normalized
            except Exception:
                return "cuda", 0, "cuda:0"
        return "cuda", 0, "cuda:0"
    return normalized, 0, normalized


def _resolve_compute_type(raw_compute_type: str, runtime_device: str) -> str:
    normalized = str(raw_compute_type or "").strip().lower()
    if normalized:
        return normalized
    return "float16" if runtime_device == "cuda" else "int8"


def get_faster_whisper_settings_snapshot(db: Session) -> FasterWhisperSettingsSnapshot:
    row = get_faster_whisper_settings(db)
    configured_device = str(getattr(row, "device", "") or DEFAULT_FASTER_WHISPER_SETTINGS["device"])
    runtime_device, runtime_device_index, resolved_device = _resolve_model_device(configured_device)
    compute_type = str(getattr(row, "compute_type", "") or "")
    resolved_compute_type = _resolve_compute_type(compute_type, runtime_device)
    return FasterWhisperSettingsSnapshot(
        device=configured_device,
        compute_type=compute_type,
        cpu_threads=max(1, int(getattr(row, "cpu_threads", DEFAULT_FASTER_WHISPER_SETTINGS["cpu_threads"]) or DEFAULT_FASTER_WHISPER_SETTINGS["cpu_threads"])),
        num_workers=max(1, int(getattr(row, "num_workers", DEFAULT_FASTER_WHISPER_SETTINGS["num_workers"]) or DEFAULT_FASTER_WHISPER_SETTINGS["num_workers"])),
        beam_size=max(1, int(getattr(row, "beam_size", DEFAULT_FASTER_WHISPER_SETTINGS["beam_size"]) or DEFAULT_FASTER_WHISPER_SETTINGS["beam_size"])),
        vad_filter=bool(getattr(row, "vad_filter", DEFAULT_FASTER_WHISPER_SETTINGS["vad_filter"])),
        condition_on_previous_text=bool(
            getattr(row, "condition_on_previous_text", DEFAULT_FASTER_WHISPER_SETTINGS["condition_on_previous_text"])
        ),
        resolved_device=resolved_device,
        resolved_device_index=runtime_device_index,
        resolved_compute_type=resolved_compute_type,
    )


def _runtime_settings_snapshot() -> FasterWhisperSettingsSnapshot:
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        return get_faster_whisper_settings_snapshot(db)
    finally:
        db.close()


def _settings_summary(snapshot: FasterWhisperSettingsSnapshot) -> dict[str, Any]:
    payload = asdict(snapshot)
    payload["model_dir"] = str(FASTER_WHISPER_MODEL_DIR)
    payload["model_id"] = FASTER_WHISPER_MODELSCOPE_MODEL_ID
    return payload


def _clear_cached_model() -> None:
    global _CACHED_MODEL, _CACHED_MODEL_SIGNATURE
    with _MODEL_LOCK:
        _CACHED_MODEL = None
        _CACHED_MODEL_SIGNATURE = ""


def _is_cuda_runtime_load_error(exc: Exception) -> bool:
    return bool(_CUDA_RUNTIME_ERROR_RE.search(str(exc or "")))


def _can_retry_on_cpu(snapshot: FasterWhisperSettingsSnapshot, exc: Exception) -> bool:
    return snapshot.resolved_device.startswith("cuda") and _is_cuda_runtime_load_error(exc)


def _cpu_retry_snapshot(snapshot: FasterWhisperSettingsSnapshot) -> FasterWhisperSettingsSnapshot:
    return replace(
        snapshot,
        device="cpu",
        compute_type="int8",
        resolved_device="cpu",
        resolved_device_index=0,
        resolved_compute_type="int8",
    )


def _transcribe_with_model_snapshot(audio_path: str, snapshot: FasterWhisperSettingsSnapshot):
    model = _get_or_create_model(snapshot)
    return model.transcribe(
        str(audio_path),
        beam_size=int(snapshot.beam_size),
        word_timestamps=True,
        vad_filter=bool(snapshot.vad_filter),
        condition_on_previous_text=bool(snapshot.condition_on_previous_text),
    )


def _meta_path() -> Path:
    return FASTER_WHISPER_MODEL_DIR / FASTER_WHISPER_META_FILE


def _read_meta() -> dict[str, Any]:
    try:
        if not _meta_path().exists():
            return {}
        payload = json.loads(_meta_path().read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _write_meta() -> None:
    payload = {
        "model_id": FASTER_WHISPER_MODELSCOPE_MODEL_ID,
        "model_dir": str(FASTER_WHISPER_MODEL_DIR),
        "required_files": list(FASTER_WHISPER_REQUIRED_FILES),
    }
    _meta_path().write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _missing_model_files() -> list[str]:
    return [name for name in FASTER_WHISPER_REQUIRED_FILES if not (FASTER_WHISPER_MODEL_DIR / name).exists()]


def _model_cache_matches_current_config() -> bool:
    meta = _read_meta()
    configured_model_id = str(FASTER_WHISPER_MODELSCOPE_MODEL_ID or "").strip()
    cached_model_id = str(meta.get("model_id") or "").strip()
    return not cached_model_id or cached_model_id == configured_model_id


def has_faster_whisper_model_cache() -> bool:
    return not _missing_model_files()


def faster_whisper_prefetch_needed() -> bool:
    return not has_faster_whisper_model_cache() or not _model_cache_matches_current_config()


def _load_snapshot_download():
    try:
        from modelscope import snapshot_download
    except Exception as exc:  # pragma: no cover - import depends on runtime env
        raise RuntimeError(f"modelscope import failed: {str(exc)[:400]}") from exc
    return snapshot_download


def _load_whisper_model_symbol():
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # pragma: no cover - import depends on runtime env
        raise RuntimeError(f"faster-whisper import failed: {str(exc)[:400]}") from exc
    return WhisperModel


def _set_download_runtime(*, in_progress: bool | None = None, last_error: str | None = None) -> None:
    global _DOWNLOAD_IN_PROGRESS, _LAST_DOWNLOAD_ERROR
    with _STATUS_LOCK:
        if in_progress is not None:
            _DOWNLOAD_IN_PROGRESS = bool(in_progress)
        if last_error is not None:
            _LAST_DOWNLOAD_ERROR = str(last_error or "").strip()[:1200]


def _download_runtime_snapshot() -> tuple[bool, str]:
    with _STATUS_LOCK:
        return bool(_DOWNLOAD_IN_PROGRESS), str(_LAST_DOWNLOAD_ERROR or "")


def _prefetch_running() -> bool:
    with _PREFETCH_LOCK:
        return bool(_PREFETCH_THREAD and _PREFETCH_THREAD.is_alive())


def _prepare_running() -> bool:
    with _PREPARE_LOCK:
        return bool(_PREPARE_THREAD and _PREPARE_THREAD.is_alive())


def get_faster_whisper_model_status() -> dict[str, Any]:
    missing_files = _missing_model_files()
    cached = not missing_files
    cache_matches = _model_cache_matches_current_config()
    download_required = (not cached) or (not cache_matches)
    downloading, last_error = _download_runtime_snapshot()
    preparing = downloading or _prefetch_running() or _prepare_running()

    if preparing:
        status = "preparing"
        message = "模型准备中，请稍候"
    elif download_required and last_error:
        status = "error"
        message = "模型准备失败，请重试"
    elif download_required:
        status = "missing"
        if not cached:
            message = "模型未下载，需要先准备"
        else:
            message = "模型缓存与当前配置不一致，需要重新准备"
    else:
        status = "ready"
        message = "模型已就绪"

    return {
        "model_key": FASTER_WHISPER_ASR_MODEL,
        "status": status,
        "download_required": bool(download_required),
        "preparing": bool(preparing),
        "cached": bool(cached and cache_matches),
        "message": message,
        "last_error": str(last_error or ""),
        "model_dir": str(FASTER_WHISPER_MODEL_DIR),
        "missing_files": list(missing_files),
    }


def prepare_faster_whisper_model(*, force_refresh: bool = False) -> dict[str, Any]:
    current_status = get_faster_whisper_model_status()
    if not force_refresh and current_status["cached"] and not current_status["download_required"]:
        return current_status

    scheduled = schedule_faster_whisper_model_prepare(force_refresh=force_refresh)
    next_status = get_faster_whisper_model_status()
    if scheduled or next_status["preparing"]:
        next_status.update(
            {
                "status": "preparing",
                "preparing": True,
                "message": "模型准备中，请稍候",
                "last_error": "",
            }
        )
    return next_status


def ensure_faster_whisper_model_ready_for_transcribe() -> dict[str, Any]:
    status = get_faster_whisper_model_status()
    if status["cached"] and not status["download_required"]:
        return status

    scheduled = schedule_faster_whisper_model_prepare(force_refresh=False)
    next_status = get_faster_whisper_model_status()
    if scheduled or next_status["preparing"]:
        next_status.update(
            {
                "status": "preparing",
                "preparing": True,
                "message": "Faster Whisper model is preparing. Please retry in a moment.",
                "last_error": "",
            }
        )
    elif next_status["status"] == "missing":
        next_status["message"] = "Faster Whisper model is not ready yet. Please prepare it first."
    raise FasterWhisperModelNotReadyError(next_status)


def ensure_faster_whisper_model_downloaded(*, force_refresh: bool = False) -> Path:
    with _MODEL_LOCK:
        if not force_refresh and has_faster_whisper_model_cache() and _model_cache_matches_current_config():
            return FASTER_WHISPER_MODEL_DIR

        _set_download_runtime(in_progress=True, last_error="")
        try:
            FASTER_WHISPER_MODEL_DIR.parent.mkdir(parents=True, exist_ok=True)
            snapshot_download = _load_snapshot_download()
            logger.info(
                "[DEBUG] faster_whisper.download_start model_id=%s model_dir=%s force_refresh=%s missing=%s",
                FASTER_WHISPER_MODELSCOPE_MODEL_ID,
                FASTER_WHISPER_MODEL_DIR,
                force_refresh,
                ",".join(_missing_model_files()),
            )
            snapshot_download(
                FASTER_WHISPER_MODELSCOPE_MODEL_ID,
                local_dir=str(FASTER_WHISPER_MODEL_DIR),
                local_files_only=False,
            )
            missing = _missing_model_files()
            if missing:
                error_text = f"faster-whisper model incomplete: {', '.join(missing)}"
                _set_download_runtime(last_error=error_text)
                raise RuntimeError(error_text)
            _write_meta()
            _set_download_runtime(last_error="")
            logger.info(
                "[DEBUG] faster_whisper.download_done model_id=%s model_dir=%s",
                FASTER_WHISPER_MODELSCOPE_MODEL_ID,
                FASTER_WHISPER_MODEL_DIR,
            )
            return FASTER_WHISPER_MODEL_DIR
        except Exception as exc:
            _set_download_runtime(last_error=str(exc)[:1200])
            raise
        finally:
            _set_download_runtime(in_progress=False)


def _emit_faster_whisper_progress(progress_callback, payload: dict[str, Any]) -> None:
    if not progress_callback:
        return
    try:
        progress_callback(payload)
    except Exception:
        pass


def _prefetch_model_worker() -> None:
    global _PREFETCH_THREAD
    try:
        if not faster_whisper_prefetch_needed():
            logger.info("[DEBUG] faster_whisper.prefetch_skip reason=cache_ready")
            return
        ensure_faster_whisper_model_downloaded(force_refresh=False)
        logger.info("[DEBUG] faster_whisper.prefetch_done model_dir=%s", FASTER_WHISPER_MODEL_DIR)
    except Exception as exc:
        logger.exception("[DEBUG] faster_whisper.prefetch_failed detail=%s", str(exc)[:400])
    finally:
        with _PREFETCH_LOCK:
            _PREFETCH_THREAD = None


def _prepare_model_worker(*, force_refresh: bool) -> None:
    global _PREPARE_THREAD
    try:
        ensure_faster_whisper_model_downloaded(force_refresh=force_refresh)
        logger.info("[DEBUG] faster_whisper.prepare_done model_dir=%s force_refresh=%s", FASTER_WHISPER_MODEL_DIR, force_refresh)
    except Exception as exc:
        logger.exception("[DEBUG] faster_whisper.prepare_failed detail=%s", str(exc)[:400])
    finally:
        with _PREPARE_LOCK:
            _PREPARE_THREAD = None


def schedule_faster_whisper_model_prepare(*, force_refresh: bool = False) -> bool:
    global _PREPARE_THREAD
    current_status = get_faster_whisper_model_status()
    if not force_refresh and current_status["cached"] and not current_status["download_required"]:
        return False
    with _PREPARE_LOCK:
        if _PREPARE_THREAD and _PREPARE_THREAD.is_alive():
            return False
        _PREPARE_THREAD = threading.Thread(
            target=_prepare_model_worker,
            kwargs={"force_refresh": force_refresh},
            name="faster-whisper-prepare",
            daemon=True,
        )
        _PREPARE_THREAD.start()
        return True


def schedule_faster_whisper_model_prefetch() -> bool:
    global _PREFETCH_THREAD
    if not FASTER_WHISPER_PREFETCH_ON_START:
        return False
    if not faster_whisper_prefetch_needed():
        return False
    with _PREFETCH_LOCK:
        if _PREFETCH_THREAD and _PREFETCH_THREAD.is_alive():
            return False
        _PREFETCH_THREAD = threading.Thread(target=_prefetch_model_worker, name="faster-whisper-prefetch", daemon=True)
        _PREFETCH_THREAD.start()
        return True


def _model_signature(snapshot: FasterWhisperSettingsSnapshot) -> str:
    return json.dumps(
        {
            "model_dir": str(FASTER_WHISPER_MODEL_DIR),
            "model_id": FASTER_WHISPER_MODELSCOPE_MODEL_ID,
            "device": snapshot.device,
            "resolved_device": snapshot.resolved_device,
            "resolved_device_index": int(snapshot.resolved_device_index),
            "compute_type": snapshot.compute_type,
            "resolved_compute_type": snapshot.resolved_compute_type,
            "cpu_threads": int(snapshot.cpu_threads),
            "num_workers": int(snapshot.num_workers),
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def _get_or_create_model(settings: FasterWhisperSettingsSnapshot | None = None):
    global _CACHED_MODEL, _CACHED_MODEL_SIGNATURE

    snapshot = settings or _runtime_settings_snapshot()
    model_dir = FASTER_WHISPER_MODEL_DIR
    signature = _model_signature(snapshot)
    with _MODEL_LOCK:
        if _CACHED_MODEL is not None and _CACHED_MODEL_SIGNATURE == signature:
            return _CACHED_MODEL
        WhisperModel = _load_whisper_model_symbol()
        _CACHED_MODEL = WhisperModel(
            str(model_dir),
            device=snapshot.resolved_device.split(":", 1)[0],
            device_index=int(snapshot.resolved_device_index),
            compute_type=snapshot.resolved_compute_type,
            cpu_threads=int(snapshot.cpu_threads),
            num_workers=int(snapshot.num_workers),
        )
        _CACHED_MODEL_SIGNATURE = signature
        return _CACHED_MODEL


def _seconds_to_ms(value: Any) -> int:
    try:
        numeric = float(value or 0)
    except Exception:
        return 0
    return max(0, int(round(numeric * 1000)))


def _normalize_surface_token(surface: str) -> tuple[str, str]:
    trimmed = str(surface or "").strip()
    punctuation = ""
    for ch in reversed(trimmed):
        if ch.isalnum():
            break
        punctuation = f"{ch}{punctuation}"
    normalized = _NON_WORD_EDGE_RE.sub("", trimmed) or trimmed
    return normalized, punctuation


def _segment_word_payload(item: Any) -> dict[str, Any] | None:
    surface = str(getattr(item, "word", "") or "").strip()
    begin_ms = _seconds_to_ms(getattr(item, "start", 0))
    end_ms = _seconds_to_ms(getattr(item, "end", 0))
    if not surface or end_ms <= begin_ms:
        return None
    text, punctuation = _normalize_surface_token(surface)
    return {
        "text": text or surface,
        "surface": surface,
        "punctuation": punctuation,
        "begin_time": begin_ms,
        "end_time": end_ms,
        "probability": float(getattr(item, "probability", 0) or 0),
    }


def _serialize_info(info: Any) -> dict[str, Any]:
    return {
        "language": str(getattr(info, "language", "") or ""),
        "language_probability": float(getattr(info, "language_probability", 0) or 0),
        "duration": float(getattr(info, "duration", 0) or 0),
        "duration_after_vad": float(getattr(info, "duration_after_vad", 0) or 0),
        "all_language_probs": list(getattr(info, "all_language_probs", None) or []),
    }


def transcribe_audio_file_with_faster_whisper(
    audio_path: str,
    *,
    settings: FasterWhisperSettingsSnapshot | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    snapshot = settings or _runtime_settings_snapshot()
    ensure_faster_whisper_model_ready_for_transcribe()
    started = time.monotonic()
    _emit_faster_whisper_progress(progress_callback, {"elapsed_seconds": 0, "segment_done": 0, "segment_total": 0})

    waiting_stop = threading.Event()
    progress_state = {
        "segment_done": 0,
        "first_segment_elapsed": None,
        "last_segment_elapsed": 0,
        "duration_hint_seconds": 0.0,
    }
    progress_state_lock = threading.Lock()
    effective_snapshot = snapshot

    def _emit_waiting_progress() -> None:
        last_logged_bucket = -1
        while not waiting_stop.wait(1.0):
            elapsed_seconds = max(0, int(round(time.monotonic() - started)))
            with progress_state_lock:
                segment_done = int(progress_state["segment_done"])
                first_segment_elapsed = progress_state["first_segment_elapsed"]
                last_segment_elapsed = int(progress_state["last_segment_elapsed"])
                duration_hint_seconds = float(progress_state["duration_hint_seconds"])
            _emit_faster_whisper_progress(
                progress_callback,
                {
                    "elapsed_seconds": elapsed_seconds,
                    "segment_done": segment_done,
                    "segment_total": 0,
                },
            )
            current_bucket = elapsed_seconds // 10
            if elapsed_seconds >= 10 and current_bucket != last_logged_bucket:
                last_logged_bucket = current_bucket
                logger.info(
                    "[DEBUG] faster_whisper.progress_waiting device=%s compute_type=%s elapsed_seconds=%s segment_done=%s first_segment_elapsed=%s last_segment_elapsed=%s duration_hint_seconds=%.3f",
                    effective_snapshot.resolved_device,
                    effective_snapshot.resolved_compute_type,
                    elapsed_seconds,
                    segment_done,
                    first_segment_elapsed,
                    last_segment_elapsed,
                    duration_hint_seconds,
                )

    waiting_thread = threading.Thread(
        target=_emit_waiting_progress,
        name="faster-whisper-progress-waiting",
        daemon=True,
    )
    waiting_thread.start()

    logger.info(
        "[DEBUG] faster_whisper.transcribe_start audio_path=%s device=%s compute_type=%s cpu_threads=%s num_workers=%s beam_size=%s vad_filter=%s condition_on_previous_text=%s",
        audio_path,
        snapshot.resolved_device,
        snapshot.resolved_compute_type,
        snapshot.cpu_threads,
        snapshot.num_workers,
        snapshot.beam_size,
        snapshot.vad_filter,
        snapshot.condition_on_previous_text,
    )
    try:
        segments_iter, info = _transcribe_with_model_snapshot(audio_path, snapshot)
    except Exception as exc:
        if not _can_retry_on_cpu(snapshot, exc):
            waiting_stop.set()
            waiting_thread.join(timeout=0.2)
            raise
        fallback_snapshot = _cpu_retry_snapshot(snapshot)
        logger.warning(
            "[DEBUG] faster_whisper.cuda_runtime_fallback audio_path=%s requested_device=%s requested_compute_type=%s detail=%s fallback_device=%s fallback_compute_type=%s",
            audio_path,
            snapshot.resolved_device,
            snapshot.resolved_compute_type,
            str(exc)[:400],
            fallback_snapshot.resolved_device,
            fallback_snapshot.resolved_compute_type,
        )
        _clear_cached_model()
        effective_snapshot = fallback_snapshot
        try:
            segments_iter, info = _transcribe_with_model_snapshot(audio_path, fallback_snapshot)
        except Exception:
            waiting_stop.set()
            waiting_thread.join(timeout=0.2)
            raise
    duration_hint_seconds = max(
        0.0,
        float(getattr(info, "duration_after_vad", 0) or 0),
        float(getattr(info, "duration", 0) or 0),
    )
    with progress_state_lock:
        progress_state["duration_hint_seconds"] = duration_hint_seconds

    transcript_words: list[dict[str, Any]] = []
    transcript_sentences: list[dict[str, Any]] = []
    preview_parts: list[str] = []
    last_end_ms = 0
    segment_done = 0

    try:
        for segment in segments_iter:
            text = str(getattr(segment, "text", "") or "").strip()
            begin_ms = _seconds_to_ms(getattr(segment, "start", 0))
            end_ms = _seconds_to_ms(getattr(segment, "end", 0))
            last_end_ms = max(last_end_ms, end_ms)
            if not text or end_ms <= begin_ms:
                continue

            segment_done += 1
            elapsed_seconds = max(0, int(round(time.monotonic() - started)))
            with progress_state_lock:
                progress_state["segment_done"] = segment_done
                progress_state["last_segment_elapsed"] = elapsed_seconds
                if progress_state["first_segment_elapsed"] is None:
                    progress_state["first_segment_elapsed"] = elapsed_seconds
                    logger.info(
                        "[DEBUG] faster_whisper.first_segment audio_path=%s elapsed_seconds=%s duration_hint_seconds=%.3f device=%s compute_type=%s",
                        audio_path,
                        elapsed_seconds,
                        duration_hint_seconds,
                        effective_snapshot.resolved_device,
                        effective_snapshot.resolved_compute_type,
                    )

            _emit_faster_whisper_progress(
                progress_callback,
                {
                    "elapsed_seconds": elapsed_seconds,
                    "segment_done": segment_done,
                    "segment_total": 0,
                },
            )

            words_payload = []
            for word in list(getattr(segment, "words", None) or []):
                payload = _segment_word_payload(word)
                if payload:
                    words_payload.append(payload)
                    transcript_words.append(payload)

            sentence_payload: dict[str, Any] = {
                "text": text,
                "begin_time": begin_ms,
                "end_time": end_ms,
            }
            if words_payload:
                sentence_payload["words"] = words_payload
            transcript_sentences.append(sentence_payload)
            preview_parts.append(text)
    finally:
        waiting_stop.set()
        waiting_thread.join(timeout=0.2)

    duration_seconds = max(
        1,
        math.ceil(
            max(
                float(getattr(info, "duration_after_vad", 0) or 0),
                float(getattr(info, "duration", 0) or 0),
                last_end_ms / 1000.0,
            )
        ),
    )
    preview_text = " ".join(preview_parts).strip()
    language = str(getattr(info, "language", "") or "").strip()

    logger.info(
        "[DEBUG] faster_whisper.transcribe_done audio_path=%s elapsed_seconds=%s segment_count=%s duration_hint_seconds=%.3f device=%s compute_type=%s",
        audio_path,
        max(0, int(round(time.monotonic() - started))),
        segment_done,
        duration_hint_seconds,
        effective_snapshot.resolved_device,
        effective_snapshot.resolved_compute_type,
    )
    _emit_faster_whisper_progress(
        progress_callback,
        {
            "elapsed_seconds": max(0, int(round(time.monotonic() - started))),
            "segment_done": segment_done,
            "segment_total": segment_done,
        },
    )

    asr_payload = {
        "source": "faster_whisper_server",
        "engine": "faster_whisper",
        "transcripts": [
            {
                "text": preview_text,
                "lang": language,
                "words": transcript_words,
                "sentences": transcript_sentences,
            }
        ],
    }

    return {
        "model": FASTER_WHISPER_ASR_MODEL,
        "task_id": "",
        "task_status": "SUCCEEDED",
        "usage_seconds": duration_seconds,
        "transcription_url": "",
        "preview_text": preview_text,
        "asr_result_json": asr_payload,
        "provider": "faster_whisper",
        "settings_summary": _settings_summary(effective_snapshot),
        "raw_generate_result": {
            "info": _serialize_info(info),
            "segment_count": len(transcript_sentences),
        },
    }
