from __future__ import annotations

from app.services.lesson_builder import normalize_token


def check_tokens(expected_tokens: list[str], user_tokens: list[str]) -> tuple[bool, list[dict[str, object]], list[str], str]:
    normalized_expected = [normalize_token(tok) for tok in list(expected_tokens or []) if normalize_token(tok)]
    normalized_input = [normalize_token(tok) for tok in list(user_tokens or []) if normalize_token(tok)]

    max_len = max(len(normalized_expected), len(normalized_input))
    token_results: list[dict[str, object]] = []
    passed = len(normalized_expected) == len(normalized_input)

    for i in range(max_len):
        expected = normalized_expected[i] if i < len(normalized_expected) else ""
        actual = normalized_input[i] if i < len(normalized_input) else ""
        correct = bool(expected and actual and expected == actual)
        if expected != actual:
            passed = False
        token_results.append({"expected": expected, "input": actual, "correct": correct})

    return passed, token_results, normalized_expected, " ".join(normalized_expected)
