from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TokenCheckOutcome:
    passed: bool
    expected_tokens: list[str]
    normalized_expected: str
