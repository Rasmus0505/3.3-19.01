"""Dictation lesson generation from reading pack sentences — Phase 43."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY
from app.models.lesson import Lesson, LessonSentence
from app.services.collins_levels import normalize_collins_level
from app.services.lesson_builder import (
    normalize_learning_english_text,
    tokenize_learning_sentence,
)
from app.services.lessons.vocabulary import extract_vocabulary_analysis_from_sentences
from app.services.tts_service import get_available_voices, synthesize_speech

logger = logging.getLogger(__name__)

# Approximate ms per character for TTS audio at normal speed
_MS_PER_CHAR = 60


def _pick_default_voice() -> str:
    """Pick first available English voice, fallback to a safe default."""
    voices = get_available_voices()
    for v in voices:
        lang = (v.language or "").lower()
        if "english" in lang or "en" in lang:
            return v.voice
    if voices:
        return voices[0].voice
    return "Chelsie"


def _translate_sentence(text: str) -> str:
    """Translate a single sentence to Chinese. Returns empty string on failure."""
    api_key = (DASHSCOPE_API_KEY or "").strip()
    if not api_key or not text.strip():
        return ""
    try:
        from app.services.translation_qwen_mt import translate_to_zh
        return translate_to_zh(text, api_key=api_key)
    except Exception as exc:
        logger.warning("Translation failed for sentence: %s — %s", text[:60], exc)
        return ""


def generate_dictation_lesson(
    db: Session,
    *,
    user_id: int,
    sentences: list[str],
    target_level: int,
    article_title: str,
    voice: str | None = None,
) -> Lesson:
    """Create a Lesson + LessonSentences from reading pack sentences via TTS.

    Each sentence gets:
    - TTS audio synthesis
    - Chinese translation
    - Tokenization for immersive typing practice

    Returns the created Lesson.
    """
    if not sentences:
        raise ValueError("No sentences provided")

    effective_voice = voice or _pick_default_voice()
    truncated_title = article_title[:200] if article_title else "阅读包"

    lesson = Lesson(
        user_id=user_id,
        title=f"听写练习: {truncated_title}",
        source_filename="reading_pack_dictation",
        asr_model="tts_generated",
        media_storage="server",
        duration_ms=0,
        source_duration_ms=0,
        status="ready",
        user_collins_level=normalize_collins_level(target_level, default=3) or 3,
    )
    db.add(lesson)
    db.flush()

    cumulative_ms = 0
    prepared_sentences: list[dict[str, object]] = []

    for idx, raw_sentence in enumerate(sentences):
        text = raw_sentence.strip()
        if not text:
            continue

        # Normalize for typing validation
        normalized_text = normalize_learning_english_text(text)
        tokens = tokenize_learning_sentence(text)
        if not tokens:
            continue

        # TTS
        audio_url = None
        try:
            tts_result = synthesize_speech(
                text=text,
                voice=effective_voice,
                language_type="English",
            )
            audio_url = tts_result.audio_url
        except Exception as exc:
            logger.warning("TTS failed for sentence %d: %s", idx, exc)

        # Translation
        text_zh = _translate_sentence(text)

        # Timing estimation
        estimated_duration = max(len(text) * _MS_PER_CHAR, 1000)
        begin_ms = cumulative_ms
        end_ms = cumulative_ms + estimated_duration
        cumulative_ms = end_ms + 500  # 500ms gap between sentences

        prepared_sentences.append(
            {
                "idx": idx,
                "begin_ms": begin_ms,
                "end_ms": end_ms,
                "text_en": normalized_text,
                "text_zh": text_zh,
                "tokens": tokens,
                "audio_url": audio_url,
            }
        )

    if not prepared_sentences:
        db.rollback()
        raise ValueError("No valid sentences could be processed")

    vocabulary_analyses = extract_vocabulary_analysis_from_sentences(
        [str(item["text_en"]) for item in prepared_sentences],
        lesson.user_collins_level,
    )

    created_sentences: list[LessonSentence] = []
    for prepared, analysis in zip(prepared_sentences, vocabulary_analyses):
        sentence_record = LessonSentence(
            lesson_id=lesson.id,
            idx=int(prepared["idx"]),
            begin_ms=int(prepared["begin_ms"]),
            end_ms=int(prepared["end_ms"]),
            text_en=str(prepared["text_en"]),
            text_zh=str(prepared["text_zh"]),
            tokens_json=[str(item) for item in list(prepared["tokens"])],
            audio_clip_path=str(prepared["audio_url"] or "") or None,
            vocabulary_analysis_json={
                "words": list(analysis.get("words_above") or []),
                "word_levels": dict(analysis.get("word_levels") or {}),
                "user_collins_level": lesson.user_collins_level,
            },
        )
        created_sentences.append(sentence_record)
        db.add(sentence_record)

    lesson.duration_ms = cumulative_ms
    lesson.source_duration_ms = cumulative_ms
    db.commit()
    db.refresh(lesson)

    logger.info(
        "Created dictation lesson %d with %d sentences for user %d",
        lesson.id,
        len(created_sentences),
        user_id,
    )

    return lesson
