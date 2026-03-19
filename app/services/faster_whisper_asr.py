from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from pathlib import Path
from typing import Any

from app.core.config import (
    FASTER_WHISPER_COMPUTE_TYPE,
    FASTER_WHISPER_CPU_THREADS,
    FASTER_WHISPER_MODEL_DIR,
    FASTER_WHISPER_MODELSCOPE_MODEL_ID,
    FASTER_WHISPER_PREFETCH_ON_START,
)


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


def _model_signature() -> str:
    return json.dumps(
        {
            "model_dir": str(FASTER_WHISPER_MODEL_DIR),
            "compute_type": FASTER_WHISPER_COMPUTE_TYPE,
            "cpu_threads": int(FASTER_WHISPER_CPU_THREADS),
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def _get_or_create_model():
    global _CACHED_MODEL, _CACHED_MODEL_SIGNATURE

    model_dir = ensure_faster_whisper_model_downloaded(force_refresh=False)
    signature = _model_signature()
    with _MODEL_LOCK:
        if _CACHED_MODEL is not None and _CACHED_MODEL_SIGNATURE == signature:
            return _CACHED_MODEL
        WhisperModel = _load_whisper_model_symbol()
        _CACHED_MODEL = WhisperModel(
            str(model_dir),
            device="cpu",
            compute_type=FASTER_WHISPER_COMPUTE_TYPE,
            cpu_threads=int(FASTER_WHISPER_CPU_THREADS),
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


def transcribe_audio_file_with_faster_whisper(audio_path: str, *, progress_callback=None) -> dict[str, Any]:
    started = time.monotonic()
    _emit_faster_whisper_progress(progress_callback, {"elapsed_seconds": 0, "segment_done": 0, "segment_total": 0})

    # Keep emitting waiting progress until the first segment arrives.
    waiting_stop = threading.Event()
    first_segment_seen = threading.Event()

    def _emit_waiting_progress() -> None:
        while not waiting_stop.wait(1.0):
            if first_segment_seen.is_set():
                return
            _emit_faster_whisper_progress(
                progress_callback,
                {
                    "elapsed_seconds": max(0, int(round(time.monotonic() - started))),
                    "segment_done": 0,
                    "segment_total": 0,
                },
            )

    waiting_thread = threading.Thread(
        target=_emit_waiting_progress,
        name="faster-whisper-progress-waiting",
        daemon=True,
    )
    waiting_thread.start()

    model = _get_or_create_model()
    segments_iter, info = model.transcribe(
        str(audio_path),
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    transcript_words: list[dict[str, Any]] = []
    transcript_sentences: list[dict[str, Any]] = []
    preview_parts: list[str] = []
    last_end_ms = 0
    segment_done = 0
    segment_total_estimated = 0
    duration_hint_seconds = max(
        0.0,
        float(getattr(info, "duration_after_vad", 0) or 0),
        float(getattr(info, "duration", 0) or 0),
    )

    try:
        for segment in segments_iter:
            text = str(getattr(segment, "text", "") or "").strip()
            begin_ms = _seconds_to_ms(getattr(segment, "start", 0))
            end_ms = _seconds_to_ms(getattr(segment, "end", 0))
            last_end_ms = max(last_end_ms, end_ms)
            if not text or end_ms <= begin_ms:
                continue

            segment_done += 1
            if segment_done == 1:
                first_segment_seen.set()
            segment_end_seconds = max(0.0, float(getattr(segment, "end", 0) or 0))
            if segment_end_seconds > 0:
                span_seconds = max(duration_hint_seconds, segment_end_seconds)
                estimated_total = int(round(segment_done * span_seconds / segment_end_seconds))
                segment_total_estimated = max(segment_total_estimated, segment_done, estimated_total)
            else:
                segment_total_estimated = max(segment_total_estimated, segment_done)

            _emit_faster_whisper_progress(
                progress_callback,
                {
                    "elapsed_seconds": max(0, int(round(time.monotonic() - started))),
                    "segment_done": segment_done,
                    "segment_total": segment_total_estimated,
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
        "settings_summary": {
            "model_dir": str(FASTER_WHISPER_MODEL_DIR),
            "model_id": FASTER_WHISPER_MODELSCOPE_MODEL_ID,
            "compute_type": FASTER_WHISPER_COMPUTE_TYPE,
            "cpu_threads": int(FASTER_WHISPER_CPU_THREADS),
        },
        "raw_generate_result": {
            "info": _serialize_info(info),
            "segment_count": len(transcript_sentences),
        },
    }
