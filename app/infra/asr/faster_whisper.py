"""Faster-Whisper ASR provider implementation."""
from __future__ import annotations

import logging
import math
import re
from dataclasses import replace
from typing import Any, Callable, Optional

from app.core.config import (
    FASTER_WHISPER_MODEL_DIR,
    FASTER_WHISPER_MODELSCOPE_MODEL_ID,
)
from app.core.timezone import now_shanghai_naive
from app.infra.asr.base import ASRConfig, ASRProvider, ASRResult
from app.models import FasterWhisperSetting
from app.services.faster_whisper_asr import (
    FASTER_WHISPER_ASR_MODEL,
    FasterWhisperCancellationRequested,
    FasterWhisperModelNotReadyError,
    get_faster_whisper_model_status,
    get_faster_whisper_settings_snapshot,
    schedule_faster_whisper_model_prepare,
    transcribe_audio_file_with_faster_whisper,
)
from app.services.lesson_task_manager import is_task_terminate_requested


logger = logging.getLogger(__name__)

FASTER_WHISPER_REQUIRED_FILES: tuple[str, ...] = (
    "config.json",
    "model.bin",
    "preprocessor_config.json",
    "tokenizer.json",
    "vocabulary.json",
)

_NON_WORD_EDGE_RE = re.compile(r"^[^\w]+|[^\w]+$")


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


def _convert_to_asr_result(result: dict[str, Any]) -> ASRResult:
    """Convert faster-whisper result dict to ASRResult."""
    asr_result_json = result.get("asr_result_json", {})
    transcripts = asr_result_json.get("transcripts", [])
    preview_text = result.get("preview_text", "")

    segments = []
    transcript_words = []
    for transcript in transcripts:
        if not isinstance(transcript, dict):
            continue
        words_data = transcript.get("words", [])
        sentences_data = transcript.get("sentences", [])

        for word in words_data:
            if isinstance(word, dict):
                transcript_words.append(word)
            else:
                payload = _segment_word_payload(word)
                if payload:
                    transcript_words.append(payload)

        for sentence in sentences_data:
            if isinstance(sentence, dict):
                segments.append(sentence)

    return ASRResult(
        text=preview_text,
        language=asr_result_json.get("transcripts", [{}])[0].get("lang") if transcripts else None,
        duration_seconds=result.get("usage_seconds"),
        segments=segments,
        provider="faster_whisper",
        model=result.get("model", FASTER_WHISPER_ASR_MODEL),
        raw_result=result,
    )


class FasterWhisperASRProvider(ASRProvider):
    """Faster-Whisper ASR provider implementation."""

    def __init__(self, db_session_factory=None):
        """Initialize Faster-Whisper ASR provider.

        Args:
            db_session_factory: Optional database session factory for settings.
        """
        self._db_session_factory = db_session_factory

    @property
    def provider_name(self) -> str:
        """Return provider name."""
        return "faster_whisper"

    def _default_model_name(self) -> str:
        """Return the default model name."""
        return FASTER_WHISPER_ASR_MODEL

    def supports_model(self, model_name: str) -> bool:
        """Check if this provider supports the given model name."""
        return model_name == FASTER_WHISPER_ASR_MODEL

    def transcribe(
        self,
        audio_path: str,
        config: Optional[ASRConfig] = None,
        progress_callback: Callable[..., None] | None = None,
    ) -> ASRResult:
        """Transcribe audio file using Faster-Whisper.

        Args:
            audio_path: Path to audio file
            config: Optional ASR configuration
            progress_callback: Optional callback for progress updates

        Returns:
            ASRResult with transcribed text and metadata
        """
        try:
            result = transcribe_audio_file_with_faster_whisper(
                audio_path,
                progress_callback=progress_callback,
            )
            return _convert_to_asr_result(result)
        except FasterWhisperCancellationRequested as exc:
            raise FasterWhisperCancellationRequested(str(exc) or "terminate requested") from exc
        except FasterWhisperModelNotReadyError as exc:
            status_payload = dict(getattr(exc, "status_payload", None) or get_faster_whisper_model_status())
            raise FasterWhisperModelNotReadyError(status_payload) from exc

    def prepare_model(self, force_refresh: bool = False) -> dict[str, Any]:
        """Prepare the model for transcription.

        Args:
            force_refresh: Force re-download even if cached

        Returns:
            Model status dict
        """
        return schedule_faster_whisper_model_prepare(force_refresh=force_refresh)

    def get_model_status(self) -> dict[str, Any]:
        """Get current model status.

        Returns:
            Model status dict
        """
        return get_faster_whisper_model_status()


__all__ = [
    "FasterWhisperASRProvider",
    "FasterWhisperCancellationRequested",
    "FasterWhisperModelNotReadyError",
]
