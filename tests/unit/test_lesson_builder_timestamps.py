from __future__ import annotations

import pytest

from app.services.lesson_builder import extract_sentences, resolve_official_sentence_timestamps_ms


def test_extract_sentences_repairs_zero_duration_official_sentence():
    payload = {
        "transcripts": [
            {
                "sentences": [
                    {
                        "text": "Ow!",
                        "begin_time": 10560,
                        "end_time": 10560,
                        "words": [{"text": "Ow", "begin_time": 10560, "end_time": 10560}],
                    }
                ]
            }
        ]
    }

    [sentence] = extract_sentences(payload)

    assert sentence["begin_ms"] == 10560
    assert sentence["end_ms"] > sentence["begin_ms"]


def test_extract_sentences_accepts_runtime_ms_fields():
    payload = {
        "transcripts": [
            {
                "sentences": [
                    {
                        "text": "Hello world.",
                        "begin_ms": 1200,
                        "end_ms": 2200,
                    }
                ]
            }
        ]
    }

    assert extract_sentences(payload) == [
        {"text": "Hello world.", "begin_ms": 1200, "end_ms": 2200}
    ]


def test_resolve_official_sentence_timestamps_accepts_fractional_seconds():
    assert resolve_official_sentence_timestamps_ms({"text": "Hello.", "start_time": 1.5, "end_time": 2.25}) == (
        1500,
        2250,
    )


def test_extract_sentences_still_rejects_missing_official_timestamps():
    payload = {"transcripts": [{"sentences": [{"text": "No timestamps"}]}]}

    with pytest.raises(ValueError, match="invalid official timestamps"):
        extract_sentences(payload)


def test_extract_sentences_rejects_reversed_official_timestamps():
    payload = {
        "transcripts": [
            {
                "sentences": [
                    {
                        "text": "Reversed.",
                        "begin_time": 2000,
                        "end_time": 1000,
                    }
                ]
            }
        ]
    }

    with pytest.raises(ValueError, match="invalid official timestamps"):
        extract_sentences(payload)
