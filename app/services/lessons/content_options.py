from __future__ import annotations

from typing import Any

GENERATION_OPTION_KEYS: tuple[str, ...] = (
    "core_subtitles",
    "zh_translation",
    "vocabulary_annotation",
    "word_explanation",
    "forced_alignment",
)
CONTENT_STATUS_KEYS: tuple[str, ...] = GENERATION_OPTION_KEYS
CONTENT_STATE_GENERATED = "generated"
CONTENT_STATE_SKIPPED = "skipped"
CONTENT_STATE_PENDING_REGENERATE = "pending_regenerate"
CONTENT_STATE_BLOCKED_DEPENDENCY = "blocked_dependency"
CONTENT_STATE_VALUES: tuple[str, ...] = (
    CONTENT_STATE_GENERATED,
    CONTENT_STATE_SKIPPED,
    CONTENT_STATE_PENDING_REGENERATE,
    CONTENT_STATE_BLOCKED_DEPENDENCY,
)


def default_generation_options() -> dict[str, bool]:
    # Keep core subtitles always on while defaulting extra cost/features conservatively.
    return {
        "core_subtitles": True,
        "zh_translation": True,
        "vocabulary_annotation": True,
        "word_explanation": False,
        "forced_alignment": False,
    }


def normalize_generation_options(
    value: dict[str, Any] | None,
    *,
    defaults: dict[str, Any] | None = None,
) -> dict[str, bool]:
    base = default_generation_options()
    if isinstance(defaults, dict):
        for key in GENERATION_OPTION_KEYS:
            if key == "core_subtitles":
                continue
            if key in defaults:
                base[key] = bool(defaults.get(key))

    if isinstance(value, dict):
        for key in GENERATION_OPTION_KEYS:
            if key == "core_subtitles":
                continue
            if key in value:
                base[key] = bool(value.get(key))

    base["core_subtitles"] = True
    if base["word_explanation"]:
        base["vocabulary_annotation"] = True
    return base


def normalize_generated_content_status(value: dict[str, Any] | None) -> dict[str, str]:
    normalized = {
        "core_subtitles": CONTENT_STATE_GENERATED,
        "zh_translation": CONTENT_STATE_GENERATED,
        "vocabulary_annotation": CONTENT_STATE_GENERATED,
        "word_explanation": CONTENT_STATE_GENERATED,
    }
    if not isinstance(value, dict):
        return normalized
    for key in CONTENT_STATUS_KEYS:
        candidate = str(value.get(key) or "").strip().lower()
        if candidate in CONTENT_STATE_VALUES:
            normalized[key] = candidate
    return normalized


def build_generated_content_status(
    *,
    effective_options: dict[str, Any] | None,
    translation_state: str = CONTENT_STATE_GENERATED,
    vocabulary_state: str = CONTENT_STATE_GENERATED,
    explanation_state: str = CONTENT_STATE_GENERATED,
) -> dict[str, str]:
    options = normalize_generation_options(effective_options)
    status = {
        "core_subtitles": CONTENT_STATE_GENERATED,
        "zh_translation": translation_state if options["zh_translation"] else CONTENT_STATE_SKIPPED,
        "vocabulary_annotation": vocabulary_state if options["vocabulary_annotation"] else CONTENT_STATE_SKIPPED,
        "word_explanation": explanation_state if options["word_explanation"] else CONTENT_STATE_SKIPPED,
    }
    if options["word_explanation"] and not options["vocabulary_annotation"]:
        status["word_explanation"] = CONTENT_STATE_BLOCKED_DEPENDENCY
    return normalize_generated_content_status(status)


def infer_generation_options_from_lesson(
    *,
    requested: dict[str, Any] | None,
    effective: dict[str, Any] | None,
    sentences: list[Any] | None = None,
) -> tuple[dict[str, bool], dict[str, bool]]:
    if isinstance(requested, dict) or isinstance(effective, dict):
        normalized_effective = normalize_generation_options(effective, defaults=requested if isinstance(requested, dict) else None)
        normalized_requested = normalize_generation_options(requested, defaults=normalized_effective)
        return normalized_requested, normalized_effective

    sentence_list = list(sentences or [])
    inferred_effective = default_generation_options()
    if sentence_list:
        inferred_effective["zh_translation"] = any(bool(getattr(item, "text_zh", None) or (item.get("text_zh") if isinstance(item, dict) else "")) for item in sentence_list)
        inferred_effective["vocabulary_annotation"] = any(
            bool(getattr(item, "vocabulary_analysis_json", None) if not isinstance(item, dict) else item.get("vocabulary_analysis_json"))
            for item in sentence_list
        )
        inferred_effective["word_explanation"] = any(
            bool(
                (getattr(item, "key_explanations_json", None) if not isinstance(item, dict) else item.get("key_explanations_json"))
                or (getattr(item, "explanation_text", None) if not isinstance(item, dict) else item.get("explanation_text"))
            )
            for item in sentence_list
        )
        if inferred_effective["word_explanation"]:
            inferred_effective["vocabulary_annotation"] = True
    return normalize_generation_options(inferred_effective), normalize_generation_options(inferred_effective)


def infer_generated_content_status_from_lesson(
    *,
    stored_status: dict[str, Any] | None,
    effective_options: dict[str, Any] | None,
    sentences: list[Any] | None = None,
) -> dict[str, str]:
    if isinstance(stored_status, dict):
        return normalize_generated_content_status(stored_status)

    options = normalize_generation_options(effective_options)
    sentence_list = list(sentences or [])
    has_translation = any(bool(getattr(item, "text_zh", None) or (item.get("text_zh") if isinstance(item, dict) else "")) for item in sentence_list)
    has_vocabulary = any(
        bool(getattr(item, "vocabulary_analysis_json", None) if not isinstance(item, dict) else item.get("vocabulary_analysis_json"))
        for item in sentence_list
    )
    has_explanation = any(
        bool(
            (getattr(item, "key_explanations_json", None) if not isinstance(item, dict) else item.get("key_explanations_json"))
            or (getattr(item, "explanation_text", None) if not isinstance(item, dict) else item.get("explanation_text"))
        )
        for item in sentence_list
    )
    return build_generated_content_status(
        effective_options=options,
        translation_state=CONTENT_STATE_GENERATED if has_translation else CONTENT_STATE_SKIPPED,
        vocabulary_state=CONTENT_STATE_GENERATED if has_vocabulary else CONTENT_STATE_SKIPPED,
        explanation_state=CONTENT_STATE_GENERATED if has_explanation else CONTENT_STATE_SKIPPED,
    )


def clear_sentence_generated_content(sentence: dict[str, Any], *, clear_translation: bool, clear_vocabulary: bool, clear_explanation: bool) -> dict[str, Any]:
    payload = dict(sentence or {})
    if clear_translation:
        payload["text_zh"] = ""
    if clear_vocabulary:
        payload["vocabulary_analysis_json"] = None
    if clear_explanation:
        payload["needs_explanation"] = False
        payload["explanation_text"] = None
        payload["simplified_sentence"] = None
        payload["explanation_audio_url"] = None
        payload["key_explanations_json"] = None
    return payload



