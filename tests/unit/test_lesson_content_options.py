from __future__ import annotations

from app.services.lessons.content_options import (
    CONTENT_STATE_GENERATED,
    CONTENT_STATE_SKIPPED,
    build_generated_content_status,
    normalize_generation_options,
)


def test_normalize_generation_options_forces_core_and_dependencies():
    payload = normalize_generation_options(
        {
            "core_subtitles": False,
            "zh_translation": False,
            "cefr_annotation": False,
            "word_explanation": True,
        }
    )

    assert payload["core_subtitles"] is True
    assert payload["word_explanation"] is True
    assert payload["cefr_annotation"] is True
    assert payload["zh_translation"] is False


def test_build_generated_content_status_marks_skipped_items():
    payload = build_generated_content_status(
        effective_options={
            "core_subtitles": True,
            "zh_translation": False,
            "cefr_annotation": True,
            "word_explanation": False,
        },
        translation_state=CONTENT_STATE_GENERATED,
        cefr_state=CONTENT_STATE_GENERATED,
        explanation_state=CONTENT_STATE_GENERATED,
    )

    assert payload["core_subtitles"] == CONTENT_STATE_GENERATED
    assert payload["zh_translation"] == CONTENT_STATE_SKIPPED
    assert payload["cefr_annotation"] == CONTENT_STATE_GENERATED
    assert payload["word_explanation"] == CONTENT_STATE_SKIPPED
