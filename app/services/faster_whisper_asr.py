from __future__ import annotations

from dataclasses import asdict, dataclass, replace
import logging
import os
from pathlib import Path
import shutil
import threading
import time
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import ASR_BUNDLE_ROOT_DIR
from app.db import SessionLocal
from app.models import FasterWhisperSetting


logger = logging.getLogger(__name__)

FASTER_WHISPER_ASR_MODEL = "faster-whisper-medium"
FASTER_WHISPER_MODELSCOPE_MODEL_ID = "Systran/faster-distil-whisper-small.en"
FASTER_WHISPER_MODEL_DIR = Path(
    os.getenv("FASTER_WHISPER_MODEL_DIR", "").strip() or str(ASR_BUNDLE_ROOT_DIR / "faster-distil-small.en")
).expanduser()
FASTER_WHISPER_REQUIRED_FILES: tuple[str, ...] = ("config.json", "model.bin")

_DEFAULT_SETTINGS = {
    "device": "cpu",
    "compute_type": "",
    "cpu_threads": 4,
    "num_workers": 2,
    "beam_size": 5,
    "vad_filter": True,
    "condition_on_previous_text": False,
}
_PREPARE_LOCK = threading.Lock()
_PREPARE_THREAD: threading.Thread | None = None
_PREPARE_LAST_ERROR = ""
_CACHED_MODEL = None
_CACHED_MODEL_SIGNATURE = ""


class FasterWhisperModelNotReadyError(RuntimeError):
    pass


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


def _use_database_backed_settings() -> bool:
    if os.getenv("DATABASE_URL", "").strip():
        return True
    app_env = str(os.getenv("APP_ENV", "")).strip().lower()
    return app_env not in {"", "desktop"}


def _normalize_model_dir(model_dir: Path | None = None) -> Path:
    target = Path(model_dir or FASTER_WHISPER_MODEL_DIR).expanduser()
    return target.resolve(strict=False)


def _bundled_model_dir() -> Path:
    configured = os.getenv("DESKTOP_PREINSTALLED_MODEL_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve(strict=False)
    return (ASR_BUNDLE_ROOT_DIR / "faster-distil-small.en").resolve(strict=False)


def _directory_file_count(path: Path) -> int:
    if not path.exists() or not path.is_dir():
        return 0
    return sum(1 for item in path.rglob("*") if item.is_file())


def has_faster_whisper_model_cache(model_dir: Path | None = None) -> bool:
    target_dir = _normalize_model_dir(model_dir)
    if not target_dir.exists() or not target_dir.is_dir():
        return False
    for file_name in FASTER_WHISPER_REQUIRED_FILES:
        if not (target_dir / file_name).is_file():
            return False
    return True


def _model_cache_matches_current_config() -> bool:
    return True


def _copy_directory(source_dir: Path, target_dir: Path) -> None:
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    shutil.copytree(source_dir, target_dir)


def ensure_faster_whisper_model_downloaded(force_refresh: bool = False) -> Path:
    target_dir = _normalize_model_dir()
    if not force_refresh and has_faster_whisper_model_cache(target_dir) and _model_cache_matches_current_config():
        return target_dir

    source_dir = _bundled_model_dir()
    if not source_dir.exists() or not source_dir.is_dir():
        raise FasterWhisperModelNotReadyError(f"Bundled model source is unavailable: {source_dir}")

    _copy_directory(source_dir, target_dir)
    return target_dir


def _prepare_worker(force_refresh: bool = False) -> None:
    global _PREPARE_LAST_ERROR
    try:
        ensure_faster_whisper_model_downloaded(force_refresh=force_refresh)
        _PREPARE_LAST_ERROR = ""
    except Exception as exc:  # pragma: no cover - background failure path
        _PREPARE_LAST_ERROR = str(exc)[:1200]
        logger.exception("[desktop] faster_whisper.prepare_failed detail=%s", _PREPARE_LAST_ERROR)
    finally:
        global _PREPARE_THREAD
        with _PREPARE_LOCK:
            _PREPARE_THREAD = None


def schedule_faster_whisper_model_prepare(force_refresh: bool = False) -> bool:
    global _PREPARE_THREAD
    with _PREPARE_LOCK:
        if _PREPARE_THREAD and _PREPARE_THREAD.is_alive():
            return True
        _PREPARE_THREAD = threading.Thread(
            target=_prepare_worker,
            kwargs={"force_refresh": bool(force_refresh)},
            daemon=True,
            name="faster-whisper-prepare",
        )
        _PREPARE_THREAD.start()
        return True


def get_faster_whisper_model_status() -> dict[str, Any]:
    model_dir = _normalize_model_dir()
    source_dir = _bundled_model_dir()
    cached = has_faster_whisper_model_cache(model_dir)
    preparing = bool(_PREPARE_THREAD and _PREPARE_THREAD.is_alive())
    source_available = source_dir.exists() and source_dir.is_dir() and _directory_file_count(source_dir) > 0
    missing_files = [name for name in FASTER_WHISPER_REQUIRED_FILES if not (model_dir / name).is_file()]

    if cached:
        status = "ready"
        message = "Bottle 1.0 local model is ready."
    elif preparing:
        status = "preparing"
        message = "Bottle 1.0 local model is preparing."
    elif source_available:
        status = "missing"
        message = "Bottle 1.0 local model can be installed on this desktop."
    else:
        status = "missing"
        message = "Bottle 1.0 local model bundle is unavailable."

    return {
        "model_key": FASTER_WHISPER_ASR_MODEL,
        "display_name": "Bottle 1.0",
        "subtitle": "Higher accuracy, slower than Bottle 2.0.",
        "note": "Runs on the desktop helper and can fall back to cloud APIs.",
        "runtime_kind": "hybrid_local_cloud",
        "runtime_label": "Desktop Local / Cloud",
        "prepare_mode": "desktop_local_or_cloud",
        "cache_scope": "desktop_and_server",
        "supports_upload": True,
        "supports_preview": False,
        "supports_transcribe_api": True,
        "source_model_id": FASTER_WHISPER_MODELSCOPE_MODEL_ID,
        "deploy_path": str(model_dir),
        "status": status,
        "available": cached,
        "download_required": not cached,
        "preparing": preparing,
        "cached": cached,
        "message": message,
        "last_error": _PREPARE_LAST_ERROR,
        "model_dir": str(model_dir),
        "missing_files": missing_files,
        "actions": [
            {
                "key": "prepare",
                "label": "Prepare",
                "enabled": not preparing and (source_available or cached),
                "primary": True,
            }
        ],
    }


def prepare_faster_whisper_model() -> dict[str, Any]:
    payload = dict(get_faster_whisper_model_status())
    if payload.get("cached"):
        return payload
    if schedule_faster_whisper_model_prepare(force_refresh=False):
        payload["status"] = "preparing"
        payload["preparing"] = True
        payload["last_error"] = ""
        payload["message"] = "Bottle 1.0 local model is preparing."
    return payload


def _ensure_faster_whisper_settings_schema(db: Session) -> None:
    FasterWhisperSetting.__table__.create(bind=db.get_bind(), checkfirst=True)


def get_faster_whisper_settings(db: Session) -> FasterWhisperSetting:
    _ensure_faster_whisper_settings_schema(db)
    row = db.get(FasterWhisperSetting, 1)
    if row is None:
        row = FasterWhisperSetting(id=1, **_DEFAULT_SETTINGS)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _resolve_runtime_settings_row() -> FasterWhisperSetting | None:
    if not _use_database_backed_settings():
        return None
    session = SessionLocal()
    try:
        row = get_faster_whisper_settings(session)
        session.expunge(row)
        return row
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("[desktop] faster_whisper.settings_fallback detail=%s", str(exc)[:400])
        return None
    finally:
        session.close()


def _resolve_device_config(device: str, compute_type: str) -> tuple[str, int, str]:
    normalized_device = str(device or "cpu").strip().lower() or "cpu"
    normalized_compute_type = str(compute_type or "").strip().lower()
    if normalized_device.startswith("cuda"):
        index = 0
        if ":" in normalized_device:
            try:
                index = max(0, int(normalized_device.split(":", 1)[1]))
            except Exception:
                index = 0
        return normalized_device, index, normalized_compute_type or "float16"
    if normalized_device == "auto":
        return "cuda:0", 0, normalized_compute_type or "float16"
    return "cpu", 0, normalized_compute_type or "int8"


def _runtime_settings_snapshot() -> FasterWhisperSettingsSnapshot:
    row = _resolve_runtime_settings_row()
    base = {
        "device": str(getattr(row, "device", _DEFAULT_SETTINGS["device"]) or _DEFAULT_SETTINGS["device"]),
        "compute_type": str(getattr(row, "compute_type", _DEFAULT_SETTINGS["compute_type"]) or ""),
        "cpu_threads": max(1, int(getattr(row, "cpu_threads", _DEFAULT_SETTINGS["cpu_threads"]) or _DEFAULT_SETTINGS["cpu_threads"])),
        "num_workers": max(1, int(getattr(row, "num_workers", _DEFAULT_SETTINGS["num_workers"]) or _DEFAULT_SETTINGS["num_workers"])),
        "beam_size": max(1, int(getattr(row, "beam_size", _DEFAULT_SETTINGS["beam_size"]) or _DEFAULT_SETTINGS["beam_size"])),
        "vad_filter": bool(getattr(row, "vad_filter", _DEFAULT_SETTINGS["vad_filter"])),
        "condition_on_previous_text": bool(
            getattr(row, "condition_on_previous_text", _DEFAULT_SETTINGS["condition_on_previous_text"])
        ),
    }
    resolved_device, resolved_device_index, resolved_compute_type = _resolve_device_config(base["device"], base["compute_type"])
    return FasterWhisperSettingsSnapshot(
        **base,
        resolved_device=resolved_device,
        resolved_device_index=resolved_device_index,
        resolved_compute_type=resolved_compute_type,
    )


def _load_whisper_model_symbol():
    from faster_whisper import WhisperModel

    return WhisperModel


def _model_signature(settings: FasterWhisperSettingsSnapshot, model_dir: Path) -> str:
    return "|".join(
        [
            str(model_dir),
            settings.resolved_device,
            str(settings.resolved_device_index),
            settings.resolved_compute_type,
            str(settings.cpu_threads),
            str(settings.num_workers),
        ]
    )


def _get_or_create_model(settings: FasterWhisperSettingsSnapshot | None = None):
    global _CACHED_MODEL, _CACHED_MODEL_SIGNATURE

    snapshot = settings or _runtime_settings_snapshot()
    model_dir = ensure_faster_whisper_model_downloaded(force_refresh=False)
    signature = _model_signature(snapshot, model_dir)
    if _CACHED_MODEL is not None and _CACHED_MODEL_SIGNATURE == signature:
        return _CACHED_MODEL

    whisper_model = _load_whisper_model_symbol()
    device_name = "cuda" if snapshot.resolved_device.startswith("cuda") else "cpu"
    kwargs: dict[str, Any] = {
        "device": device_name,
        "compute_type": snapshot.resolved_compute_type,
        "cpu_threads": snapshot.cpu_threads,
        "num_workers": snapshot.num_workers,
    }
    if device_name == "cuda":
        kwargs["device_index"] = snapshot.resolved_device_index
    _CACHED_MODEL = whisper_model(str(model_dir), **kwargs)
    _CACHED_MODEL_SIGNATURE = signature
    return _CACHED_MODEL


def ensure_faster_whisper_model_ready_for_transcribe() -> dict[str, Any]:
    model_dir = ensure_faster_whisper_model_downloaded(force_refresh=False)
    if not has_faster_whisper_model_cache(model_dir):
        raise FasterWhisperModelNotReadyError(f"Faster-whisper model cache is incomplete: {model_dir}")
    return {"status": "ready", "model_dir": str(model_dir)}


def _normalize_word(word: Any) -> tuple[str, str]:
    surface = str(getattr(word, "word", "") or "").strip()
    punctuation = ""
    token_text = surface
    while token_text and not token_text[-1].isalnum():
        punctuation = f"{token_text[-1]}{punctuation}"
        token_text = token_text[:-1]
    return token_text.strip() or surface.strip(), punctuation


def _build_asr_payload(segments: list[Any], info: Any) -> dict[str, Any]:
    words: list[dict[str, Any]] = []
    sentences: list[dict[str, Any]] = []
    transcript_text_parts: list[str] = []
    for segment in segments:
        sentence_text = str(getattr(segment, "text", "") or "").strip()
        begin_ms = max(0, int(round(float(getattr(segment, "start", 0.0) or 0.0) * 1000)))
        end_ms = max(begin_ms, int(round(float(getattr(segment, "end", 0.0) or 0.0) * 1000)))
        if sentence_text:
            transcript_text_parts.append(sentence_text)
            sentences.append(
                {
                    "text": sentence_text,
                    "begin_time": begin_ms,
                    "end_time": end_ms,
                }
            )
        for word in list(getattr(segment, "words", None) or []):
            token_text, punctuation = _normalize_word(word)
            word_begin_ms = max(0, int(round(float(getattr(word, "start", 0.0) or 0.0) * 1000)))
            word_end_ms = max(word_begin_ms, int(round(float(getattr(word, "end", 0.0) or 0.0) * 1000)))
            if not token_text:
                continue
            words.append(
                {
                    "text": token_text,
                    "surface": str(getattr(word, "word", "") or token_text),
                    "punctuation": punctuation,
                    "begin_time": word_begin_ms,
                    "end_time": word_end_ms,
                    "probability": float(getattr(word, "probability", 0.0) or 0.0),
                }
            )
    transcript_text = " ".join(part for part in transcript_text_parts if part).strip()
    return {
        "transcripts": [
            {
                "lang": str(getattr(info, "language", "") or ""),
                "language_probability": float(getattr(info, "language_probability", 0.0) or 0.0),
                "duration_seconds": float(getattr(info, "duration", 0.0) or 0.0),
                "duration_after_vad_seconds": float(getattr(info, "duration_after_vad", 0.0) or 0.0),
                "text": transcript_text,
                "words": words,
                "sentences": sentences,
            }
        ]
    }


def _emit_progress(callback, *, started_monotonic: float, segment_done: int, segment_total: int) -> None:
    if not callback:
        return
    callback(
        {
            "elapsed_seconds": max(0, int(time.monotonic() - started_monotonic)),
            "segment_done": max(0, int(segment_done)),
            "segment_total": max(0, int(segment_total)),
        }
    )


def _run_transcription(audio_path: str, snapshot: FasterWhisperSettingsSnapshot, progress_callback=None) -> dict[str, Any]:
    ensure_faster_whisper_model_ready_for_transcribe()
    model = _get_or_create_model(snapshot)
    started_monotonic = time.monotonic()
    current_state = {"segment_done": 0}
    stop_event = threading.Event()

    _emit_progress(progress_callback, started_monotonic=started_monotonic, segment_done=0, segment_total=0)

    def _heartbeat() -> None:
        while not stop_event.wait(0.5):
            _emit_progress(
                progress_callback,
                started_monotonic=started_monotonic,
                segment_done=int(current_state["segment_done"]),
                segment_total=0,
            )

    heartbeat_thread = threading.Thread(target=_heartbeat, daemon=True, name="faster-whisper-progress")
    heartbeat_thread.start()

    try:
        segment_iter, info = model.transcribe(
            audio_path,
            beam_size=snapshot.beam_size,
            word_timestamps=True,
            vad_filter=bool(snapshot.vad_filter),
            condition_on_previous_text=bool(snapshot.condition_on_previous_text),
        )
        segments: list[Any] = []
        for segment in segment_iter:
            segments.append(segment)
            current_state["segment_done"] = len(segments)
            _emit_progress(
                progress_callback,
                started_monotonic=started_monotonic,
                segment_done=len(segments),
                segment_total=0,
            )
    finally:
        stop_event.set()
        heartbeat_thread.join(timeout=1)

    asr_payload = _build_asr_payload(segments, info)
    preview_text = ""
    transcripts = list(asr_payload.get("transcripts") or [])
    if transcripts:
        preview_text = str(transcripts[0].get("text") or "").strip()

    _emit_progress(
        progress_callback,
        started_monotonic=started_monotonic,
        segment_done=len(segments),
        segment_total=len(segments),
    )
    return {
        "model": FASTER_WHISPER_ASR_MODEL,
        "task_id": "",
        "task_status": "SUCCEEDED",
        "transcription_url": "",
        "preview_text": preview_text,
        "usage_seconds": max(1, int(round(float(getattr(info, "duration", 0.0) or 0.0)))),
        "asr_result_json": asr_payload,
        "settings_summary": asdict(snapshot),
        "raw_generate_result": {
            "segment_count": len(segments),
            "language": str(getattr(info, "language", "") or ""),
        },
    }


def _should_retry_on_cpu(exc: Exception, snapshot: FasterWhisperSettingsSnapshot) -> bool:
    if not snapshot.resolved_device.startswith("cuda"):
        return False
    normalized = str(exc).lower()
    return any(token in normalized for token in ("cublas", "cudnn", "cuda", "libcudart", "cufft"))


def transcribe_audio_file_with_faster_whisper(
    audio_path: str,
    *,
    known_duration_ms: int | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    snapshot = _runtime_settings_snapshot()
    try:
        return _run_transcription(audio_path, snapshot, progress_callback=progress_callback)
    except Exception as exc:
        if not _should_retry_on_cpu(exc, snapshot):
            raise
        fallback_snapshot = replace(snapshot, resolved_device="cpu", resolved_device_index=0, resolved_compute_type="int8")
        return _run_transcription(audio_path, fallback_snapshot, progress_callback=progress_callback)


def transcribe_audio_file(audio_path: str, *, known_duration_ms: int | None = None, progress_callback=None) -> dict[str, Any]:
    return transcribe_audio_file_with_faster_whisper(
        audio_path,
        known_duration_ms=known_duration_ms,
        progress_callback=progress_callback,
    )
