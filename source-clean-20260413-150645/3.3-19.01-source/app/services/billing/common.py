from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.core.timezone import now_shanghai_naive
from app.models.billing import (
    cents_to_rate_yuan,
    normalize_rate_yuan as model_normalize_rate_yuan,
    rate_yuan_to_compat_cents,
)


logger = logging.getLogger(__name__)


@dataclass
class BillingError(Exception):
    code: str
    message: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover
        return self.message


@dataclass(frozen=True)
class SubtitleSettingsSnapshot:
    default_asr_model: str
    subtitle_split_enabled: bool
    subtitle_split_target_words: int
    subtitle_split_max_words: int
    translation_batch_max_chars: int


def now_local() -> datetime:
    return now_shanghai_naive()


def normalize_rate_yuan(value: object, *, fallback_cents: int = 0) -> Decimal:
    if value not in (None, ""):
        normalized = model_normalize_rate_yuan(value)
        if normalized > 0 or int(fallback_cents or 0) <= 0:
            return normalized
    fallback = max(0, int(fallback_cents or 0))
    return cents_to_rate_yuan(fallback)


def yuan_to_compat_cents(value: object) -> int:
    return rate_yuan_to_compat_cents(value)


def build_rate_payload(item: dict[str, object]) -> dict[str, object]:
    price_per_minute_cents = max(0, int(item.get("points_per_minute") or item.get("price_per_minute_cents") or 0))
    cost_per_minute_cents = max(0, int(item.get("cost_per_minute_cents") or 0))
    price_per_minute_yuan = normalize_rate_yuan(item.get("price_per_minute_yuan"), fallback_cents=price_per_minute_cents)
    cost_per_minute_yuan = normalize_rate_yuan(item.get("cost_per_minute_yuan"), fallback_cents=cost_per_minute_cents)
    return {
        "model_name": str(item.get("model_name") or "").strip(),
        "price_per_minute_cents": yuan_to_compat_cents(price_per_minute_yuan),
        "price_per_minute_yuan": price_per_minute_yuan,
        "points_per_1k_tokens": max(0, int(item.get("points_per_1k_tokens") or 0)),
        "cost_per_minute_cents": yuan_to_compat_cents(cost_per_minute_yuan),
        "cost_per_minute_yuan": cost_per_minute_yuan,
        "cost_per_1k_tokens_input_cents": max(0, int(item.get("cost_per_1k_tokens_input_cents") or 0)),
        "cost_per_1k_tokens_output_cents": max(0, int(item.get("cost_per_1k_tokens_output_cents") or 0)),
        "billing_unit": str(item.get("billing_unit") or "minute").strip() or "minute",
        "parallel_enabled": bool(item.get("parallel_enabled")),
        "parallel_threshold_seconds": max(1, int(item.get("parallel_threshold_seconds") or 600)),
        "segment_seconds": max(1, int(item.get("segment_seconds") or 300)),
        "max_concurrency": max(1, int(item.get("max_concurrency") or 2)),
    }
