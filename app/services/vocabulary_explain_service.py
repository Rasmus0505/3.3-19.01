from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY, VOCABULARY_EXPLAIN_TTS_VOICE
from app.services.ai_platform import call_llm_chat as call_deepseek
from app.services.collins_levels import normalize_collins_level
from app.services.dictionary_service import classify_tokens

logger = logging.getLogger(__name__)

WORD_REGEX = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")

EXPLAIN_SENTENCE_SYSTEM_PROMPT = """你是一位英语词汇教学专家，专门为中国英语学习者讲解偏难词汇。

请根据句子上下文，用中文解释需要重点处理的词。

输出 JSON：
{
  "key_explanations": [
    {
      "word": "perceive",
      "meaning": "察觉，感知",
      "usage_in_sentence": "这里表示通过观察逐渐意识到某件事",
      "common_collocations": "perceive a change, perceive a threat"
    }
  ],
  "sentence_summary": "这句话的重点是说明说话者如何理解眼前发生的变化"
}

规则：
1. 只返回有效 JSON。
2. 每个词的讲解尽量控制在 50 字内。
3. 最多解释 3 个最重要的词。
4. 重点讲当前句子里的意思和用法，不讲发音。
"""


class VocabularyExplainService:
    """Builds Collins-based vocabulary analysis and explanation payloads."""

    DEFAULT_TTS_VOICE = "Serena"
    DEFAULT_TTS_MODEL = "qwen3-tts-flash"

    def __init__(self, db: Session | None, target_level: int = 3):
        self.db = db
        self.target_level = normalize_collins_level(target_level, default=3) or 3

    def analyze_sentences(self, sentences: list[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for index, sentence in enumerate(sentences):
            matches = list(WORD_REGEX.finditer(sentence or ""))
            tokens = [match.group() for match in matches]
            classified = classify_tokens(tokens, user_collins_level=self.target_level)

            words_above: list[dict[str, Any]] = []
            word_levels: dict[str, dict[str, Any]] = {}

            for match, item in zip(matches, classified, strict=False):
                token = str(item.get("token") or match.group())
                normalized_entry = {
                    "token": token,
                    "lemma": item.get("lemma"),
                    "collins": item.get("collins"),
                    "band": item.get("band") or "unrated",
                    "start": match.start(),
                    "end": match.end(),
                }
                word_levels[token] = {
                    "lemma": item.get("lemma"),
                    "collins": item.get("collins"),
                    "band": item.get("band") or "unrated",
                }
                if normalized_entry["band"] in {"i_plus_one", "above_i_plus_one"}:
                    words_above.append(normalized_entry)

            results.append(
                {
                    "sentence_index": index,
                    "sentence": sentence,
                    "words_above": words_above,
                    "word_levels": word_levels,
                    "needs_explanation": any(item["band"] == "above_i_plus_one" for item in words_above),
                }
            )
        return results

    def generate_explanation(self, sentence: str, words_above: list[dict[str, Any]]) -> dict[str, Any]:
        explanation_words = [item for item in words_above if item.get("band") == "above_i_plus_one"][:3]
        if not explanation_words:
            return {
                "simplified_sentence": None,
                "key_explanations": [],
                "listen_tips": "",
            }

        words_str = ", ".join(str(item.get("token") or "") for item in explanation_words if item.get("token"))
        user_prompt = (
            f"句子: {sentence}\n\n"
            f"学习者当前 Collins 星级: {self.target_level}\n"
            f"需要重点讲解的词: {words_str}\n\n"
            "请按要求返回 JSON。"
        )

        messages = [
            {"role": "system", "content": EXPLAIN_SENTENCE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        try:
            content, _ = call_deepseek(
                messages=messages,
                api_key=DASHSCOPE_API_KEY,
                enable_thinking=False,
                stream=False,
                temperature=0.3,
                max_tokens=1500,
            )
            content = self._strip_json_fence(content)
            return self._convert_to_new_format(json.loads(content))
        except Exception as exc:
            logger.error("Failed to generate vocabulary explanation: %s", exc)
            return {
                "simplified_sentence": None,
                "key_explanations": [
                    {
                        "original_word": str(item.get("token") or ""),
                        "explanation": "释义: 建议结合上下文和词典进一步理解这个词。",
                    }
                    for item in explanation_words
                ],
                "listen_tips": "句子里有高于 i+1 的词，建议先理解这些词再继续听读。",
            }

    def generate_explanations_batch(self, items: list[tuple[str, list[dict[str, Any]]]]) -> list[dict[str, Any]]:
        if not items:
            return []
        results: list[dict[str, Any]] = []
        for sentence, words_above in items:
            results.append(self.generate_explanation(sentence, words_above))
        return results

    def synthesize_explanation_audio(self, text: str, voice: str | None = None) -> str:
        from app.services.tts_service import synthesize_speech

        tts_voice = voice or VOCABULARY_EXPLAIN_TTS_VOICE or self.DEFAULT_TTS_VOICE
        try:
            result = synthesize_speech(
                text=text,
                voice=tts_voice,
                model=self.DEFAULT_TTS_MODEL,
                language_type="Auto",
            )
            return result.audio_url or ""
        except Exception:
            logger.warning("TTS synthesis failed for text: %s", text[:50])
            return ""

    @staticmethod
    def _strip_json_fence(content: str) -> str:
        text = str(content or "").strip()
        if text.startswith("```"):
            parts = text.split("```")
            if len(parts) >= 2:
                text = parts[1]
            if text.startswith("json"):
                text = text[4:]
        return text.strip()

    @staticmethod
    def _convert_to_new_format(llm_result: dict[str, Any]) -> dict[str, Any]:
        raw_explanations = llm_result.get("key_explanations", [])
        sentence_summary = str(llm_result.get("sentence_summary") or "")

        key_explanations = []
        for item in raw_explanations:
            parts: list[str] = []
            meaning = str(item.get("meaning") or "").strip()
            usage = str(item.get("usage_in_sentence") or "").strip()
            collocations = str(item.get("common_collocations") or "").strip()
            if meaning:
                parts.append(f"释义: {meaning}")
            if usage:
                parts.append(f"用法: {usage}")
            if collocations:
                parts.append(f"搭配: {collocations}")
            key_explanations.append(
                {
                    "original_word": str(item.get("word") or "").strip(),
                    "explanation": " | ".join(parts),
                }
            )

        return {
            "simplified_sentence": None,
            "key_explanations": key_explanations,
            "listen_tips": sentence_summary,
        }
