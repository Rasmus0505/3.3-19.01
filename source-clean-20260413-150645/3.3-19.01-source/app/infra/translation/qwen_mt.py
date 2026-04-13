"""Qwen-MT Translation provider implementation."""
from __future__ import annotations

from typing import Any, Callable, List

from app.infra.translation.base import TranslationProvider, TranslationRequest, TranslationResult
from app.infra.translation_qwen_mt import (
    MT_MODEL,
    SemanticSplitError,
    TranslationAttemptRecord,
    TranslationBatchResult,
    TranslationError,
    current_translation_batch_max_chars,
    split_sentence_by_semantic,
    translate_sentences_to_zh,
    translation_batch_chars_scope,
)


class QwenMTProvider(TranslationProvider):
    """Qwen-MT Translation provider implementation."""

    def __init__(self, api_key: str | None = None):
        """Initialize Qwen-MT provider.

        Args:
            api_key: API key for translation service.
        """
        self._api_key = api_key or ""

    @property
    def provider_name(self) -> str:
        """Return provider name."""
        return "qwen_mt"

    def _default_model_name(self) -> str:
        """Return the default model name."""
        return MT_MODEL

    def translate(self, request: TranslationRequest) -> TranslationResult:
        """Translate a single text.

        Args:
            request: Translation request containing text and language pair

        Returns:
            TranslationResult with translated text and metadata
        """
        if not self._api_key:
            raise TranslationError(
                "missing_api_key",
                message="API key is required for translation",
            )

        try:
            result = translate_sentences_to_zh(
                sentences=[request.text],
                api_key=self._api_key,
            )
            if result.failed_count > 0:
                raise TranslationError(
                    result.latest_error_summary or "translation failed",
                    code="TRANSLATION_FAILED",
                )
            return TranslationResult(
                source_text=request.text,
                translated_text=result.texts[0] if result.texts else "",
                source_lang=request.source_lang,
                target_lang=request.target_lang,
                tokens_used=result.success_total_tokens,
                provider=self.provider_name,
                raw_result={
                    "failed_count": result.failed_count,
                    "total_requests": result.total_requests,
                    "success_request_count": result.success_request_count,
                },
            )
        except TranslationError:
            raise
        except Exception as exc:
            raise TranslationError(
                str(exc)[:1200],
                code="TRANSLATION_ERROR",
            ) from exc

    def translate_batch(
        self,
        requests: List[TranslationRequest],
        progress_callback: Callable[[int, int], None] | None = None,
        resume_state: dict[str, object] | None = None,
        checkpoint_callback: Callable[[dict[str, object]], None] | None = None,
    ) -> List[TranslationResult]:
        """Translate multiple texts in batch.

        Args:
            requests: List of translation requests
            progress_callback: Optional callback for progress (done, total)
            resume_state: Optional state to resume from
            checkpoint_callback: Optional callback for checkpoint saves

        Returns:
            List of TranslationResult
        """
        if not self._api_key:
            return [
                TranslationResult(
                    source_text=r.text,
                    translated_text="",
                    source_lang=r.source_lang,
                    target_lang=r.target_lang,
                    provider=self.provider_name,
                    raw_result={"error": "missing_api_key"},
                )
                for r in requests
            ]

        sentences = [r.text for r in requests]
        source_langs = [r.source_lang for r in requests]
        target_langs = [r.target_lang for r in requests]

        try:
            result = translate_sentences_to_zh(
                sentences=sentences,
                api_key=self._api_key,
                progress_callback=progress_callback,
                resume_state=resume_state,
                checkpoint_callback=checkpoint_callback,
            )

            results: List[TranslationResult] = []
            for i, sentence in enumerate(sentences):
                source_lang = source_langs[i] if i < len(source_langs) else "en"
                target_lang = target_langs[i] if i < len(target_langs) else "zh"

                records_for_item = [
                    rec for rec in result.attempt_records
                    if isinstance(rec, dict) and rec.get("sentence_idx") == i and rec.get("success")
                ]
                tokens_used = sum(int(rec.get("total_tokens", 0) or 0) for rec in records_for_item)

                results.append(TranslationResult(
                    source_text=sentence,
                    translated_text=result.texts[i] if i < len(result.texts) else "",
                    source_lang=source_lang,
                    target_lang=target_lang,
                    tokens_used=tokens_used if records_for_item else None,
                    provider=self.provider_name,
                    raw_result={
                        "failed": not result.texts[i] if i < len(result.texts) else True,
                        "attempt_count": len(records_for_item),
                    },
                ))
            return results
        except TranslationError:
            raise
        except Exception as exc:
            raise TranslationError(
                str(exc)[:1200],
                code="TRANSLATION_ERROR",
            ) from exc

    def split_sentence_semantic(
        self,
        text: str,
        *,
        timeout_seconds: int = 30,
    ) -> List[str]:
        """Split a sentence into shorter subtitle lines.

        Args:
            text: Text to split
            timeout_seconds: Request timeout

        Returns:
            List of shorter subtitle lines
        """
        if not self._api_key:
            raise SemanticSplitError("missing_api_key")

        return split_sentence_by_semantic(
            text,
            api_key=self._api_key,
            timeout_seconds=timeout_seconds,
        )


__all__ = [
    "QwenMTProvider",
    "TranslationError",
    "SemanticSplitError",
]
