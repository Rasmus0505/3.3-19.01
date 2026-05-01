from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.services import forced_alignment


def test_alignment_skips_non_english_sentences_and_keeps_provider_timestamps(monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.opus"
    audio_path.write_bytes(b"opus")
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "model.safetensors").write_bytes(b"stub")

    class DummyAligner:
        def align(self, *, audio, text, language):
            assert language == "English"
            assert text == "Do we know anything?"
            return [[
                SimpleNamespace(text="Do", start_time=0.00, end_time=0.08),
                SimpleNamespace(text="we", start_time=0.08, end_time=0.16),
                SimpleNamespace(text="know", start_time=0.16, end_time=0.32),
                SimpleNamespace(text="anything", start_time=0.32, end_time=0.56),
            ]]

    monkeypatch.setattr(forced_alignment, "_load_aligner", lambda *_args, **_kwargs: DummyAligner())
    monkeypatch.setattr(forced_alignment, "_predecode_audio_to_wav", lambda audio_path, wav_path: wav_path.write_bytes(b"wav"))
    monkeypatch.setattr(forced_alignment, "_cut_sentence_clip", lambda **kwargs: Path(kwargs["clip_path"]).write_bytes(b"clip"))

    result = forced_alignment.align_transcript_timestamps(
        audio_path=audio_path,
        source_sentences=[
            {"idx": 0, "text": "干。", "text_en": "干。", "language": "zh", "begin_ms": 80, "end_ms": 160},
            {
                "idx": 1,
                "text": "Do we know anything?",
                "text_en": "Do we know anything?",
                "begin_ms": 2412,
                "end_ms": 2972,
                "words": [
                    {"text": "Do", "begin_time": 2412, "end_time": 2492},
                    {"text": "we", "begin_time": 2493, "end_time": 2570},
                    {"text": "know", "begin_time": 2571, "end_time": 2710},
                    {"text": "anything", "begin_time": 2711, "end_time": 2972},
                ],
            },
        ],
        language="English",
        model_dir=model_dir,
        device="cpu",
    )

    assert result["aligned_sentence_indexes"] == [1]
    assert result["sentences"][0]["begin_ms"] == 80
    assert result["sentences"][0]["end_ms"] == 160
    assert result["sentences"][1]["begin_ms"] == 2412
    assert result["sentences"][1]["end_ms"] == 2972


def test_alignment_falls_back_locally_when_current_sentence_tokens_do_not_match():
    aligned_words = [
        {"text": "Do", "begin_ms": 2410, "end_ms": 2490},
        {"text": "we", "begin_ms": 2491, "end_ms": 2570},
        {"text": "know", "begin_ms": 2571, "end_ms": 2710},
        {"text": "anything", "begin_ms": 2711, "end_ms": 2970},
    ]
    source_sentences = [
        {
            "idx": 0,
            "text": "This will not match",
            "text_en": "This will not match",
            "begin_ms": 100,
            "end_ms": 200,
            "words": [{"text": "This"}, {"text": "will"}, {"text": "not"}, {"text": "match"}],
        },
        {
            "idx": 1,
            "text": "Do we know anything?",
            "text_en": "Do we know anything?",
            "begin_ms": 2412,
            "end_ms": 2972,
            "words": [{"text": "Do"}, {"text": "we"}, {"text": "know"}, {"text": "anything"}],
        },
    ]

    sentences, aligned_indexes = forced_alignment._build_sentence_windows(  # type: ignore[attr-defined]
        aligned_words=aligned_words,
        source_sentences=source_sentences,
    )

    assert aligned_indexes == [1]
    assert sentences[0]["begin_ms"] == 100
    assert sentences[0]["end_ms"] == 200
    assert sentences[0]["alignment_fallback_reason"].startswith("token_mismatch")
    assert sentences[1]["begin_ms"] == 2410
    assert sentences[1]["end_ms"] == 2970
