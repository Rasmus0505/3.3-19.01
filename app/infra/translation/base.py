"""Abstract base class for Translation providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranslationResult:
    """Result of translation."""
    source_text: str
    translated_text: str
    source_lang: str = "en"
    target_lang: str = "zh"
    tokens_used: int | None = None
    provider: str = ""
    raw_result: dict | None = None


@dataclass
class TranslationRequest:
    """A single translation request."""
    text: str
    source_lang: str = "en"
    target_lang: str = "zh"


class TranslationProvider(ABC):
    """Abstract base class for translation providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name."""
        pass

    @abstractmethod
    def translate(
        self,
        request: TranslationRequest,
    ) -> TranslationResult:
        """Translate a single text."""
        pass

    @abstractmethod
    def translate_batch(
        self,
        requests: list[TranslationRequest],
    ) -> list[TranslationResult]:
        """Translate multiple texts in batch."""
        pass

    @abstractmethod
    def _default_model_name(self) -> str:
        """Return the default model name for this provider."""
        pass
