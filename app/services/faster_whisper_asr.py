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


def ensure_faster_whisper_model_downloaded(*, force_refresh: bool = False) -> Path:
    with _MODEL_LOCK:
        if not force_refresh and has_faster_whisper_model_cache() and _model_cache_matches_current_config():
            return FASTER_WHISPER_MODEL_DIR

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
            raise RuntimeError(f"faster-whisper model incomplete: {', '.join(missing)}")
        _write_meta()
        logger.info(
            "[DEBUG] faster_whisper.download_done model_id=%s model_dir=%s",
            FASTER_WHISPER_MODELSCOPE_MODEL_ID,
            FASTER_WHISPER_MODEL_DIR,
        )
        return FASTER_WHISPER_MODEL_DIR


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
    if progress_callback:
        try:
            progress_callback({"elapsed_seconds": 0})
        except Exception:
            pass

    model = _get_or_create_model()
    started = time.monotonic()
    segments_iter, info = model.transcribe(
        str(audio_path),
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    segments = list(segments_iter)

    transcript_words: list[dict[str, Any]] = []
    transcript_sentences: list[dict[str, Any]] = []
    preview_parts: list[str] = []
    last_end_ms = 0

    for segment in segments:
        text = str(getattr(segment, "text", "") or "").strip()
        begin_ms = _seconds_to_ms(getattr(segment, "start", 0))
        end_ms = _seconds_to_ms(getattr(segment, "end", 0))
        last_end_ms = max(last_end_ms, end_ms)
        if not text or end_ms <= begin_ms:
            continue

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

    if progress_callback:
        try:
            progress_callback({"elapsed_seconds": max(0, int(round(time.monotonic() - started)))})
        except Exception:
            pass

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
