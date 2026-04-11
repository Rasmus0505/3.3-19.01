from __future__ import annotations

import logging
import re

from app.services.cefr_explain_service import CefrExplainService

logger = logging.getLogger(__name__)

# 批量讲解：每批最多合并的句子数（避免单次 LLM 调用 token 过多）
_EXPLANATION_BATCH_SIZE = 8


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

    # ── Phase 1: 为每句构建 word_levels + filter_result，收集需要讲解的句子 ──
    word_regex = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")
    sentence_meta: list[dict] = []  # per-sentence metadata
    needs_explanation_queue: list[int] = []  # indices into sentence_meta

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
                final_level = service._get_final_lemma_level(word, llm_lemma=None, surface_level=surface_level)
                word_levels[word] = {
                    "surface_level": surface_level,
                    "llm_lemma": None,
                    "final_level": final_level or surface_level,
                }

        filter_result = {}
        explanation_words: list[dict] = []
        if words_above:
            filter_result = service.filter_words_by_level(words_above, llm_lemmas=llm_lemmas)
            explanation_words = list(filter_result.get("valid_above_i1_words") or [])

        meta = {
            "idx": idx,
            "sentence_text": sentence_text,
            "words_above": words_above,
            "word_levels": word_levels,
            "filter_result": filter_result,
            "explanation_words": explanation_words,
            "explanation": None,
        }
        sentence_meta.append(meta)

        if explanation_words:
            needs_explanation_queue.append(idx)

    # ── Phase 2: 批量生成讲解（多句合并为一次 LLM 调用） ──
    for batch_start in range(0, len(needs_explanation_queue), _EXPLANATION_BATCH_SIZE):
        batch_indices = needs_explanation_queue[batch_start:batch_start + _EXPLANATION_BATCH_SIZE]

        if len(batch_indices) == 1:
            # 单句直接调用
            meta = sentence_meta[batch_indices[0]]
            try:
                meta["explanation"] = service.generate_explanation(meta["sentence_text"], meta["explanation_words"])
            except Exception:
                meta["explanation"] = {"simplified_sentence": None, "key_explanations": [], "listen_tips": ""}
        else:
            # 批量调用
            try:
                batch_explanations = service.generate_explanations_batch(
                    [(sentence_meta[i]["sentence_text"], sentence_meta[i]["explanation_words"]) for i in batch_indices]
                )
                for i, exp in zip(batch_indices, batch_explanations):
                    sentence_meta[i]["explanation"] = exp
            except Exception:
                logger.warning("batch explanation failed, falling back to single calls")
                for i in batch_indices:
                    meta = sentence_meta[i]
                    try:
                        meta["explanation"] = service.generate_explanation(meta["sentence_text"], meta["explanation_words"])
                    except Exception:
                        meta["explanation"] = {"simplified_sentence": None, "key_explanations": [], "listen_tips": ""}

    # ── Phase 3: 组装结果 ──
    enriched_sentences: list[dict] = []
    for idx, sentence in enumerate(sentences):
        meta = sentence_meta[idx]
        sentence["cefr_vocab_json"] = {
            "words": meta["words_above"],
            "filter_result": meta["filter_result"],
            "llm_lemmas": llm_lemmas if all_words_above else {},
            "word_levels": meta["word_levels"],
        }

        explanation = meta["explanation"]
        if explanation:
            sentence["needs_explanation"] = True
            sentence["explanation_text"] = explanation.get("listen_tips", "") or None
            sentence["simplified_sentence"] = None
            sentence["explanation_audio_url"] = None
            sentence["key_explanations_json"] = explanation.get("key_explanations") or None
        else:
            sentence["needs_explanation"] = False
            sentence["explanation_text"] = None
            sentence["simplified_sentence"] = None
            sentence["explanation_audio_url"] = None
            sentence["key_explanations_json"] = None

        enriched_sentences.append(sentence)

    return enriched_sentences


__all__ = [
    "extract_cefr_from_sentences",
    "generate_sentence_explanation",
    "process_sentences_with_cefr",
]
