"""
CEFR 讲解服务 - 听力素材的 CEFR 筛选和讲解生成
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY
from app.infra.llm.deepseek import call_deepseek

logger = logging.getLogger(__name__)

# CEFR 等级数值用于比较
CEFR_LEVEL_NUM = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6, "SUPER": 7}

EXPLAIN_SENTENCE_SYSTEM_PROMPT = """你是一位英语词汇教学专家,专门为中国英语学习者讲解生词。

## 你的角色

帮助学习者理解句子中的高级词汇:
1. 词汇的核心含义
2. 在当前句子中的具体用法
3. 常见搭配和使用场景

## 输入信息

- sentence: 原句(保持不变,仅供参考)
- target_level: 学习者的 CEFR 目标等级(如 B1)
- words_above: 句子中远超目标等级的词汇(i+2 及以上)

## 你的任务

为 words_above 中的每个词生成简洁的讲解,包含以下字段:

1. **word** - 原词/短语
2. **meaning** - 核心中文释义(1-2 个常用义项)
3. **usage_in_sentence** - 在当前句子中的具体含义和用法
4. **common_collocations** - 2-3 个常见搭配(可选)

## 质量标准

- 讲解必须用中文
- 重点是词义和用法,不涉及发音
- 每个词的讲解控制在 50 字以内
- 如果超过 3 个词,只选最重要的 3 个

## 输出格式

只返回有效的 JSON:
{
    "key_explanations": [
        {
            "word": "peruse",
            "meaning": "仔细阅读,审阅",
            "usage_in_sentence": "在这里表示'仔细查看菜单'",
            "common_collocations": "peruse a document, peruse the menu"
        }
    ],
    "sentence_summary": "这句话的核心是描述在餐厅仔细看菜单的场景"
}

## 规则

1. 原句保持不变,只用于理解上下文
2. 每个词的讲解要简洁实用
3. 如果某词有多个义项,只讲当前句子中的含义
4. 只返回有效的 JSON,不要有其他解释"""

# 不规则词形还原映射表（复用 vocabAnalyzer.js 的逻辑）
IRREGULAR_LEMMAS: dict[str, str] = {
    "ran": "run",
    "won": "win",
    "begun": "begin",
    "written": "write",
    "taken": "take",
    "given": "give",
    "seen": "see",
    "been": "be",
    "gone": "go",
    "come": "come",
    "made": "make",
    "known": "know",
    "thought": "think",
    "told": "tell",
    "found": "find",
    "said": "say",
    "got": "get",
    # 常见 B1-B2 动词的不规则 -ing 形式
    "perusing": "peruse",
    "pursuing": "pursue",
    "creating": "create",
    "sharing": "share",
    "moving": "move",
}

# 后缀还原规则（复用 vocabAnalyzer.js 的逻辑）
SUFFIX_RULES: list[tuple[str, str]] = [
    ("ies", "y"),    # stories → story
    ("es", ""),      # watches → watch
    ("ed", ""),      # walked → walk
    ("ing", ""),     # walking → walk
    ("ly", ""),      # quickly → quick
    ("ness", ""),    # happiness → happy
    ("ment", ""),    # development → develop
    ("tion", "t"),   # education → educat
    ("s", ""),       # cats → cat
]

# 非标准缩写映射（不经撇号的缩写，如 dont → do）
NONSTANDARD_CONTRACTIONS: dict[str, str] = {
    "dont": "do",
    "cant": "can",
    "wont": "will",
    "shant": "shall",
    "im": "i",
    "ive": "i",
    "id": "i",
    "ill": "i",
    "theyve": "they",
    "theyll": "they",
    "theyd": "they",
    "weve": "we",
    "well": "we",
    "wed": "we",
    "youll": "you",
    "youd": "you",
    "its": "it",
    "thats": "that",
    "whats": "what",
    "wheres": "where",
    "whos": "who",
    "whens": "when",
    "hows": "how",
    "lets": "let",
    "didnt": "do",
    "doesnt": "do",
    "isnt": "is",
    "wasnt": "be",
    "arent": "be",
    "werent": "be",
    "havent": "have",
    "hasnt": "have",
    "hadnt": "have",
    "couldnt": "can",
    "wouldnt": "will",
    "shouldnt": "shall",
    "mustnt": "must",
    "mightnt": "might",
    "aint": "be",
    "shes": "she",
    "hes": "he",
    "youre": "you",
    "theyre": "they",
    "youve": "you",
    "gonna": "go",
    "wanna": "want",
    "gotta": "get",
    "outta": "out",
    "kinda": "kind",
    "sorta": "sort",
    "lemme": "let",
    "gimme": "give",
    "dunno": "know",
    "shoulda": "should",
    "coulda": "could",
    "woulda": "would",
    "musta": "must",
    "ima": "i",
    "u": "you",
    "ur": "your",
    "r": "are",
    "b": "be",
    "c": "see",
    "y": "why",
    "n": "and",
    "rn": "right",
    "yall": "you",
}


class CefrExplainService:
    """CEFR 讲解服务"""

    def __init__(self, db: Session, target_level: str = "B1"):
        self.db = db
        self.target_level = target_level
        self.target_num = CEFR_LEVEL_NUM.get(target_level, 3)
        self.vocab_data = self._load_vocab()

    def _load_vocab(self) -> dict:
        """加载 CEFR 词典数据"""
        vocab_path = Path(__file__).parent.parent / "data" / "vocab" / "cefr_vocab_fixed.json"
        if vocab_path.exists():
            with open(vocab_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"words": {}}

    def _lookup_word(self, word: str) -> str | None:
        """查询单词的 CEFR 等级（含二次判断：词形还原后取更低等级）"""
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        # Step 1: 直接查表
        surface_level = word_map[word_lower].get("level") if word_lower in word_map else None

        # Step 2: 词形还原二次判断 — 即使直接查表命中也检查还原后的词
        # 词典不完善，变形词（如 moms=C1）可能标过高，原型（mom=A1）才是真实等级
        lemma = self._lemmatize(word_lower)
        if lemma != word_lower and lemma in word_map:
            lemma_level = word_map[lemma].get("level")
            if lemma_level:
                if not surface_level:
                    return lemma_level
                # 取等级更低的
                if self._level_num(lemma_level) < self._level_num(surface_level):
                    return lemma_level

        if surface_level:
            return surface_level

        # Step 3: 非标准缩写还原（dont → do, cant → can）
        nonstandard = self._normalize_nonstandard_contraction(word_lower)
        if nonstandard is not None and nonstandard != word_lower and nonstandard in word_map:
            return word_map[nonstandard].get("level")

        # Step 4: 标准缩写还原（don't → don't → do）
        stripped = self._strip_contraction(word_lower)
        if stripped is not None and stripped != word_lower and stripped in word_map:
            return word_map[stripped].get("level")

        return None

    def _lookup_surface_word(self, word: str) -> str | None:
        """查询表面词形的 CEFR 等级（含二次判断）。

        即使词典直接命中，也要检查词形还原后是否等级更低，取更低的等级。
        这样可以避免 moms=C1 而 mom=A1 导致的误判。
        """
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        surface_level = word_map[word_lower].get("level") if word_lower in word_map else None

        # 二次判断：词形还原后取更低等级
        lemma = self._lemmatize(word_lower)
        if lemma != word_lower and lemma in word_map:
            lemma_level = word_map[lemma].get("level")
            if lemma_level:
                if not surface_level:
                    return lemma_level
                if self._level_num(lemma_level) < self._level_num(surface_level):
                    return lemma_level

        return surface_level

    def _lookup_dictionary_form_level(self, word: str) -> str | None:
        """查询词典里的最终词形等级。

        二次筛选阶段基于词形还原后的结果再次查词典。
        """
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        if word_lower in word_map:
            return word_map[word_lower].get("level")

        nonstandard = self._normalize_nonstandard_contraction(word_lower)
        if nonstandard and nonstandard in word_map:
            return word_map[nonstandard].get("level")

        stripped = self._strip_contraction(word_lower)
        if stripped and stripped in word_map:
            return word_map[stripped].get("level")

        return None

    def _lemmatize(self, word: str) -> str:
        """词形还原（复用 vocabAnalyzer.js 的逻辑）"""
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        # 1. 先查不规则词形还原映射表
        mapped = IRREGULAR_LEMMAS.get(word_lower)
        if mapped and mapped in word_map:
            return mapped

        # 2. 再用后缀规则还原（用小写进行匹配和查找）
        for suffix, replacement in SUFFIX_RULES:
            if word_lower.endswith(suffix) and len(word_lower) > len(suffix) + 2:
                base = word_lower[:-len(suffix)] + replacement
                if len(base) > 1 and base in word_map:
                    return base

        return word_lower

    def _normalize_nonstandard_contraction(self, word: str) -> str | None:
        """非标准缩写还原（不经撇号的缩写，如 dont → do）"""
        return NONSTANDARD_CONTRACTIONS.get(word)

    def _strip_contraction(self, word: str) -> str | None:
        """标准缩写还原（weren't → were, don't → do）"""
        # 处理 n't 结尾
        m = re.match(r"^(.+?)n't$", word, re.IGNORECASE)
        if m:
            base = m.group(1).lower()
            # 特殊映射
            special_map = {"wont": "will"}
            return special_map.get(base, base)
        # 处理 's, 'd, 'm, 're, 've, 'll
        m2 = re.match(r"^(.+?)'(s|d|m|re|ve|ll)$", word, re.IGNORECASE)
        if m2:
            return m2.group(1).lower()
        return None

    def _level_num(self, level: str) -> int:
        """获取等级数值"""
        return CEFR_LEVEL_NUM.get(level.upper(), 0)

    def _get_final_lemma_level(
        self,
        word: str,
        llm_lemma: str | None = None,
        surface_level: str | None = None,
    ) -> str | None:
        """
        获取单词的最终原型词等级（应用 LLM 还原后，再查词典）。

        Args:
            word: 原始单词
            llm_lemma: LLM 还原后的原型词（可选）

        Returns:
            CEFR 等级字符串（如 "B1", "A1", "SUPER"）
        """
        if llm_lemma:
            lemma = llm_lemma
        else:
            lemma = self._lemmatize(word)

        lemma_level = self._lookup_dictionary_form_level(lemma)
        if lemma_level:
            return lemma_level
        if surface_level:
            return surface_level
        return None

    def extract_cefr_words(self, sentences: list[str]) -> list[dict]:
        """后端词典 CEFR 一次筛选 - 提取高于目标等级的词汇"""
        results = []
        word_regex = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")

        for idx, sentence in enumerate(sentences):
            words_above = []
            matches = word_regex.finditer(sentence)

            for match in matches:
                word = match.group()
                level = self._lookup_surface_word(word)

                if level:
                    level_num = self._level_num(level)
                    # 大于等于 i+1 的表面词形才进入二次筛选
                    if level_num >= self.target_num + 1:
                        words_above.append({
                            "word": word,
                            "level": level,
                            "start": match.start(),
                            "end": match.end()
                        })

            results.append({
                "sentence_index": idx,
                "sentence": sentence,
                "words_above": words_above,
                "needs_explanation": len(words_above) > 0
            })

        return results

    def llm_lemmatize(self, words: list[str]) -> dict[str, str]:
        """
        调用 LLM 对单词列表进行词形还原。

        Args:
            words: 单词列表（如 ["running", "children", "went"]）

        Returns:
            dict: {word: lemma} 映射（如 {"running": "run", "children": "child", "went": "go"}）
        """
        if not words:
            return {}

        words_str = ", ".join(sorted(set(words)))
        user_prompt = f"""Words to lemmatize: {words_str}

For each word, provide the base/lemma form (the dictionary form).
Return ONLY valid JSON in this format:
{{"word": "lemma", ...}}

Rules:
- Verbs: return infinitive form (running → run, jumped → jump, went → go)
- Nouns: return singular form (children → child, mice → mouse)
- Adjectives: return base form (better → good, worse → bad)
- Keep already-base-form words unchanged

Return ONLY valid JSON, no explanations."""

        messages = [
            {"role": "system", "content": "You are a lemmatization assistant. Return ONLY valid JSON."},
            {"role": "user", "content": user_prompt}
        ]

        try:
            content, _ = call_deepseek(
                messages=messages,
                api_key=DASHSCOPE_API_KEY,
                enable_thinking=False,
                stream=False,
                temperature=0.1,
                max_tokens=500
            )

            # 解析 JSON
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()
            result = json.loads(content)
            logger.info(f"[CEFR] LLM lemmatize called for {len(words)} words, returned {len(result)} lemmas: {result}")
            return result
        except Exception as e:
            logger.error(f"LLM lemmatize failed: {e}")
            logger.warning(f"LLM lemmatize fallback to original words for: {words}")
            # 失败时返回原始单词作为 lemma
            return {w: w for w in words}

    def filter_words_by_level(self, words_above: list[dict], llm_lemmas: dict[str, str] | None = None) -> dict:
        """
        词典二次筛选 - 基于原型词等级进行分类

        分类逻辑：
        - final_level <= 目标等级 → 过滤
        - final_level == 目标等级 + 1 → i+1
        - final_level >= 目标等级 + 2 / SUPER → above_i+1

        Args:
            words_above: 超纲词列表（来自一次筛选）
            llm_lemmas: LLM 还原后的原型词映射，优先级高于规则还原

        Returns:
            dict: {
                "valid_i1_words": [...],       # i+1 词汇（原型等级 == 目标等级）
                "valid_above_i1_words": [...], # 需简化词汇（原型等级 > 目标等级 或 查不到）
                "removed_words": [...],        # 被过滤的词（原型等级 <= 目标等级）
            }
        """
        valid_i1 = []
        valid_above_i1 = []
        removed = []

        for word_info in words_above:
            word = word_info["word"]
            surface_level = word_info["level"]

            # 优先使用 LLM 还原的原型词，否则回退到规则还原
            if llm_lemmas and word in llm_lemmas:
                lemma = llm_lemmas[word]
            else:
                lemma = self._lemmatize(word)

            final_level = self._get_final_lemma_level(word, llm_lemma=lemma, surface_level=surface_level)
            final_level_num = self._level_num(final_level) if final_level else 0

            # 分类
            if final_level_num <= self.target_num:
                removed.append({
                    **word_info,
                    "lemma": lemma,
                    "lemma_level": final_level,
                    "final_level": final_level,
                    "reason": "原型等级不高于目标等级"
                })
            elif final_level_num == self.target_num + 1:
                valid_i1.append({
                    **word_info,
                    "lemma": lemma,
                    "lemma_level": final_level,
                    "final_level": final_level,
                })
            else:
                valid_above_i1.append({
                    **word_info,
                    "lemma": lemma,
                    "lemma_level": final_level,
                    "final_level": final_level,
                })

        return {
            "valid_i1_words": valid_i1,
            "valid_above_i1_words": valid_above_i1,
            "removed_words": removed
        }

    def generate_explanation(self, sentence: str, words_above: list[dict]) -> dict:
        """生成讲解内容（调用 LLM）"""
        if not words_above:
            return {
                "simplified_sentence": None,
                "key_explanations": [],
                "listen_tips": ""
            }

        words_list = [w["word"] for w in words_above]
        words_str = ", ".join(words_list)

        user_prompt = f"""句子: {sentence}

目标等级: {self.target_level}
需要讲解的词汇: {words_str}

请为每个词生成简洁的词义和用法讲解,按照要求的 JSON 格式返回。"""

        messages = [
            {"role": "system", "content": EXPLAIN_SENTENCE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        try:
            content, _ = call_deepseek(
                messages=messages,
                api_key=DASHSCOPE_API_KEY,
                enable_thinking=False,
                stream=False,
                temperature=0.3,
                max_tokens=1500
            )

            # 尝试解析 JSON
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()

            result = json.loads(content)

            # 兼容旧格式，转换为新格式
            return self._convert_to_new_format(result, sentence)

        except Exception as e:
            logger.error(f"Failed to generate explanation: {e}")
            return {
                "simplified_sentence": None,
                "key_explanations": [
                    {
                        "original_word": w["word"],
                        "explanation": "释义: 高级词汇 | 用法: 建议查词典了解详细含义",
                    }
                    for w in words_above
                ],
                "listen_tips": "句子中包含高级词汇,建议重点理解这些词的含义"
            }

    def generate_explanations_batch(self, items: list[tuple[str, list[dict]]]) -> list[dict]:
        """批量生成多句讲解（一次 LLM 调用），大幅减少长视频的生成时间。

        Args:
            items: [(sentence_text, explanation_words), ...]

        Returns:
            list[dict]: 每句的讲解结果，顺序与输入一致
        """
        if not items:
            return []

        # 构建批量 prompt
        batch_parts = []
        for i, (sentence, words_above) in enumerate(items):
            words_str = ", ".join(w["word"] for w in words_above)
            batch_parts.append(f"[Sentence {i + 1}]\nSentence: {sentence}\nWords: {words_str}")

        user_prompt = f"""目标等级: {self.target_level}

请为以下每句话中标注的词汇生成简洁讲解。

{chr(10).join(batch_parts)}

请返回一个 JSON 数组，每个元素对应一句话，格式如下：
[
  {{
    "key_explanations": [
      {{"word": "...", "meaning": "...", "usage_in_sentence": "...", "common_collocations": "..."}}
    ],
    "sentence_summary": "..."
  }}
]

只返回有效 JSON，不要有其他解释。"""

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
                max_tokens=min(4000, 500 * len(items)),
            )

            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()

            results_raw = json.loads(content)
            if not isinstance(results_raw, list):
                results_raw = [results_raw]

            # 确保输出数量与输入匹配
            results = []
            for i, (sentence, _) in enumerate(items):
                if i < len(results_raw):
                    results.append(self._convert_to_new_format(results_raw[i], sentence))
                else:
                    results.append({"simplified_sentence": None, "key_explanations": [], "listen_tips": ""})
            return results

        except Exception as e:
            logger.error(f"Batch explanation failed: {e}")
            raise

    def _convert_to_new_format(self, llm_result: dict, sentence: str) -> dict:
        """
        将 LLM 返回的词义讲解格式转换为存储格式。

        LLM 格式:
        {
            "key_explanations": [
                {"word": "...", "meaning": "...", "usage_in_sentence": "...", "common_collocations": "..."}
            ],
            "sentence_summary": "..."
        }

        返回存储格式:
        {
            "simplified_sentence": None,
            "key_explanations": [{"original_word": "...", "explanation": "..."}],
            "listen_tips": "..."
        }
        """
        raw_explanations = llm_result.get("key_explanations", [])
        sentence_summary = llm_result.get("sentence_summary", "")

        key_explanations = []
        for item in raw_explanations:
            parts = []
            if item.get("meaning"):
                parts.append(f"释义: {item['meaning']}")
            if item.get("usage_in_sentence"):
                parts.append(f"用法: {item['usage_in_sentence']}")
            if item.get("common_collocations"):
                parts.append(f"搭配: {item['common_collocations']}")

            key_explanations.append({
                "original_word": item.get("word", ""),
                "explanation": " | ".join(parts),
            })

        return {
            "simplified_sentence": None,
            "key_explanations": key_explanations,
            "listen_tips": sentence_summary or "",
        }

    # 系统音色默认值（qwen3-tts-flash 模型支持）
    DEFAULT_TTS_VOICE = "Serena"
    DEFAULT_TTS_MODEL = "qwen3-tts-flash"

    def synthesize_explanation_audio(self, text: str, voice: str = None) -> str:
        """生成讲解 TTS 音频"""
        from app.core.config import CEFR_EXPLAIN_TTS_VOICE
        from app.services.tts_service import synthesize_speech

        tts_voice = voice or CEFR_EXPLAIN_TTS_VOICE or self.DEFAULT_TTS_VOICE

        try:
            result = synthesize_speech(
                text=text,
                voice=tts_voice,
                model=self.DEFAULT_TTS_MODEL,
                language_type="Auto",
            )
            return result.audio_url or ""
        except Exception:
            logger.warning(f"TTS synthesis failed for text: {text[:50]}...")
            return ""
