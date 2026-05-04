from __future__ import annotations

import logging

from app.services.collins_levels import normalize_collins_level
from app.services.vocabulary_explain_service import VocabularyExplainService

logger = logging.getLogger(__name__)

_EXPLANATION_BATCH_SIZE = 8


def _create_service(*, target_level: int) -> VocabularyExplainService:
    return VocabularyExplainService(db=None, target_level=target_level)


def extract_vocabulary_analysis_from_sentences(sentences: list[str], target_level: int) -> list[dict]:
    return _create_service(target_level=target_level).analyze_sentences(sentences)


def generate_vocabulary_explanation(sentence: str, words_above: list[dict], target_level: int) -> dict:
    return _create_service(target_level=target_level).generate_explanation(sentence, words_above)


def process_sentences_with_vocabulary(
    sentences: list[dict],
    target_level: int,
    user_level: int | None = None,
    include_explanations: bool = True,
) -> list[dict]:
    effective_level = normalize_collins_level(user_level, default=None) or normalize_collins_level(target_level, default=3) or 3
    service = _create_service(target_level=effective_level)
    analyses = service.analyze_sentences([str(sentence.get("text_en") or "") for sentence in sentences])

    sentence_meta: list[dict] = []
    needs_explanation_queue: list[int] = []

    for index, _ in enumerate(sentences):
        analysis = analyses[index]
        explanation_words = [item for item in analysis["words_above"] if item.get("band") == "above_i_plus_one"]
        meta = {
            "analysis": analysis,
            "explanation_words": explanation_words,
            "explanation": None,
        }
        sentence_meta.append(meta)
        if include_explanations and explanation_words:
            needs_explanation_queue.append(index)

    for batch_start in range(0, len(needs_explanation_queue), _EXPLANATION_BATCH_SIZE):
        batch_indices = needs_explanation_queue[batch_start:batch_start + _EXPLANATION_BATCH_SIZE]
        batch_items = [
            (
                str(sentences[index].get("text_en") or ""),
                sentence_meta[index]["analysis"]["words_above"],
            )
            for index in batch_indices
        ]
        try:
            batch_results = service.generate_explanations_batch(batch_items)
        except Exception:
            logger.warning("vocabulary explanation batch failed, falling back to single calls")
            batch_results = [
                service.generate_explanation(str(sentences[index].get("text_en") or ""), sentence_meta[index]["analysis"]["words_above"])
                for index in batch_indices
            ]
        for index, result in zip(batch_indices, batch_results, strict=False):
            sentence_meta[index]["explanation"] = result

    enriched_sentences: list[dict] = []
    for index, sentence in enumerate(sentences):
        payload = dict(sentence)
        analysis = sentence_meta[index]["analysis"]
        explanation = sentence_meta[index]["explanation"] if include_explanations else None
        payload["vocabulary_analysis_json"] = {
            "words": analysis["words_above"],
            "word_levels": analysis["word_levels"],
            "user_collins_level": effective_level,
        }
        if explanation:
            payload["needs_explanation"] = True
            payload["explanation_text"] = explanation.get("listen_tips") or None
            payload["simplified_sentence"] = None
            payload["explanation_audio_url"] = None
            payload["key_explanations_json"] = explanation.get("key_explanations") or None
        else:
            payload["needs_explanation"] = False
            payload["explanation_text"] = None
            payload["simplified_sentence"] = None
            payload["explanation_audio_url"] = None
            payload["key_explanations_json"] = None
        enriched_sentences.append(payload)

    return enriched_sentences


__all__ = [
    "extract_vocabulary_analysis_from_sentences",
    "generate_vocabulary_explanation",
    "process_sentences_with_vocabulary",
]
