from __future__ import annotations

import re

from app.services.cefr_explain_service import CefrExplainService


def _create_service(*, target_level: str) -> CefrExplainService:
    return CefrExplainService(db=None, target_level=target_level)


def extract_cefr_from_sentences(sentences: list[str], target_level: str) -> list[dict]:
    return _create_service(target_level=target_level).extract_cefr_words(sentences)


def generate_sentence_explanation(sentence: str, words_above: list[dict], target_level: str) -> dict:
    return _create_service(target_level=target_level).generate_explanation(sentence, words_above)


def process_sentences_with_cefr(
    sentences: list[dict],
    target_level: str,
    user_level: str | None = None,
) -> list[dict]:
    service = _create_service(target_level=target_level)
    if user_level is None:
        user_level = target_level

    sentence_texts = [sentence.get("text_en", "") for sentence in sentences]
    cefr_results = service.extract_cefr_words(sentence_texts)

    all_words_above: list[str] = []
    for cefr_info in cefr_results:
        for word_info in cefr_info.get("words_above", []):
            all_words_above.append(word_info["word"])

    llm_lemmas: dict[str, str] = {}
    if all_words_above:
        llm_lemmas = service.llm_lemmatize(all_words_above)

    enriched_sentences: list[dict] = []
    word_regex = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")

    for idx, sentence in enumerate(sentences):
        sentence_text = sentence.get("text_en", "")
        cefr_info = cefr_results[idx]
        words_above = cefr_info.get("words_above", [])
        word_levels: dict[str, dict] = {}
        words_above_set = {word["word"] for word in words_above}

        above_word_lemmas: dict[str, str] = {}
        for word in words_above:
            if word["word"] in llm_lemmas:
                above_word_lemmas[word["word"]] = llm_lemmas[word["word"]]

        for word_info in words_above:
            word = word_info["word"]
            surface_level = word_info["level"]
            llm_lemma = above_word_lemmas.get(word)
            final_level = service._get_final_lemma_level(word, llm_lemma, surface_level=surface_level)
            word_levels[word] = {
                "surface_level": surface_level,
                "llm_lemma": llm_lemma,
                "final_level": final_level,
            }

        for match in word_regex.finditer(sentence_text):
            word = match.group()
            if word in words_above_set:
                continue
            surface_level = service._lookup_surface_word(word)
            if surface_level:
                word_levels[word] = {
                    "surface_level": surface_level,
                    "llm_lemma": None,
                    "final_level": surface_level,
                }

        if not words_above:
            sentence["cefr_vocab_json"] = {
                "words": [],
                "filter_result": {},
                "llm_lemmas": llm_lemmas if all_words_above else {},
                "word_levels": word_levels,
            }
            sentence["needs_explanation"] = False
            sentence["explanation_text"] = None
            sentence["simplified_sentence"] = None
            sentence["explanation_audio_url"] = None
            sentence["key_explanations_json"] = None
            enriched_sentences.append(sentence)
            continue

        filter_result = service.filter_words_by_level(words_above, llm_lemmas=llm_lemmas)
        explanation_words = [
            *list(filter_result.get("valid_i1_words") or []),
            *list(filter_result.get("valid_above_i1_words") or []),
        ]

        if not explanation_words:
            sentence["cefr_vocab_json"] = {
                "words": words_above,
                "filter_result": filter_result,
                "llm_lemmas": llm_lemmas if all_words_above else {},
                "word_levels": word_levels,
            }
            sentence["needs_explanation"] = False
            sentence["explanation_text"] = None
            sentence["simplified_sentence"] = None
            sentence["explanation_audio_url"] = None
            sentence["key_explanations_json"] = None
            enriched_sentences.append(sentence)
            continue

        try:
            explanation = service.generate_explanation(sentence_text, explanation_words)
        except Exception:
            explanation = {
                "simplified_sentence": None,
                "key_explanations": [],
                "listen_tips": "",
            }

        explanation_text = explanation.get("listen_tips", "") or ""
        if explanation.get("key_explanations"):
            explanation_text += "\n\n" + "\n".join(
                f"- {item.get('original_word', '')}: {item.get('explanation', '')}"
                for item in explanation.get("key_explanations", [])
            )

        audio_url = ""
        if explanation_text:
            try:
                audio_url = service.synthesize_explanation_audio(explanation_text)
            except Exception:
                audio_url = ""

        sentence["cefr_vocab_json"] = {
            "words": words_above,
            "filter_result": filter_result,
            "llm_lemmas": llm_lemmas if all_words_above else {},
            "word_levels": word_levels,
        }
        sentence["needs_explanation"] = True
        sentence["explanation_text"] = explanation.get("listen_tips", "") or None
        sentence["simplified_sentence"] = None
        sentence["explanation_audio_url"] = audio_url or None
        sentence["key_explanations_json"] = explanation.get("key_explanations") or None
        enriched_sentences.append(sentence)

    return enriched_sentences


__all__ = [
    "extract_cefr_from_sentences",
    "generate_sentence_explanation",
    "process_sentences_with_cefr",
]
