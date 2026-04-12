from __future__ import annotations

import json
import re
import uuid
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import (
    CEFR_LEVELS,
    LLM_MODEL_DEEPSEEK_FAST,
    LLM_MODEL_DEEPSEEK_THINKING,
    build_semantic_meaning_entries,
    logger,
    recover_json_payload,
    strip_json_fences,
)
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

router = APIRouter()

LOCAL_IRREGULAR_LEMMAS: dict[str, str] = {
    "ran": "run",
    "won": "win",
    "begun": "begin",
    "written": "write",
    "taken": "take",
    "given": "give",
    "seen": "see",
    "been": "be",
    "gone": "go",
    "made": "make",
    "known": "know",
    "thought": "think",
    "told": "tell",
    "found": "find",
    "said": "say",
    "got": "get",
    "perusing": "peruse",
    "pursuing": "pursue",
    "creating": "create",
    "sharing": "share",
    "moving": "move",
    "commuting": "commute",
    "scrutinizing": "scrutinize",
}

LOCAL_SUFFIX_RULES: list[tuple[str, str]] = [
    ("ies", "y"),
    ("es", ""),
    ("ed", ""),
    ("ing", ""),
    ("ly", ""),
    ("ness", ""),
    ("ment", ""),
    ("tion", "t"),
    ("s", ""),
]

LOCAL_NONSTANDARD_CONTRACTIONS: dict[str, str] = {
    "dont": "do",
    "cant": "can",
    "wont": "will",
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
}


def _llm_module():
    from app.api.routers import llm as llm_root

    return llm_root


@lru_cache(maxsize=1)
def _load_vocab_words() -> set[str]:
    vocab_path = Path(__file__).resolve().parents[2] / "data" / "vocab" / "cefr_vocab_fixed.json"
    if not vocab_path.exists():
        return set()
    with open(vocab_path, "r", encoding="utf-8") as file:
        payload = json.load(file)
    return set(payload.get("words", {}).keys())


def _strip_contraction(word: str) -> str | None:
    lowered = str(word or "").lower()
    matched = re.match(r"^(.+?)n't$", lowered, re.IGNORECASE)
    if matched:
        base = matched.group(1).lower()
        return {"wont": "will"}.get(base, base)
    matched = re.match(r"^(.+?)'(s|d|m|re|ve|ll)$", lowered, re.IGNORECASE)
    if matched:
        return matched.group(1).lower()
    return None


def _candidate_local_lemmas(word: str) -> list[str]:
    lowered = str(word or "").strip().lower()
    if not lowered:
        return [""]

    candidates: list[str] = []

    irregular = LOCAL_IRREGULAR_LEMMAS.get(lowered)
    if irregular:
        candidates.insert(0, irregular)

    nonstandard = LOCAL_NONSTANDARD_CONTRACTIONS.get(lowered)
    if nonstandard:
        candidates.insert(0, nonstandard)

    stripped = _strip_contraction(lowered)
    if stripped:
        candidates.insert(0, stripped)

    for suffix, replacement in LOCAL_SUFFIX_RULES:
        if lowered.endswith(suffix) and len(lowered) > len(suffix) + 2:
            base = lowered[: -len(suffix)] + replacement
            candidates.append(base)
            if suffix in {"ing", "ed"}:
                if len(base) >= 2 and base[-1] == base[-2]:
                    candidates.append(base[:-1])
                if not base.endswith("e"):
                    candidates.append(base + "e")
            if suffix == "es":
                candidates.append(lowered[:-1])

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = str(candidate or "").strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    if lowered not in seen:
        deduped.append(lowered)
    return deduped or [lowered]


def _local_lemmatize_word(word: str) -> str:
    vocab_words = _load_vocab_words()
    candidates = _candidate_local_lemmas(word)
    for candidate in candidates:
        if candidate in vocab_words:
            return candidate
    return candidates[0]


def _coerce_lemmas_from_payload(parsed: object, words: list[str]) -> list[str] | None:
    if isinstance(parsed, dict):
        if isinstance(parsed.get("lemmas"), list):
            raw_lemmas = parsed.get("lemmas") or []
            return [
                str(raw_lemmas[index]).strip().lower() if index < len(raw_lemmas) and str(raw_lemmas[index]).strip()
                else _local_lemmatize_word(word)
                for index, word in enumerate(words)
            ]

        if parsed and all(isinstance(value, (str, int, float, bool)) or value is None for value in parsed.values()):
            normalized_mapping = {str(key).strip().lower(): str(value or "").strip().lower() for key, value in parsed.items()}
            return [
                normalized_mapping.get(str(word).strip().lower()) or _local_lemmatize_word(word)
                for word in words
            ]

    if isinstance(parsed, list):
        return [
            str(parsed[index]).strip().lower() if index < len(parsed) and str(parsed[index]).strip()
            else _local_lemmatize_word(word)
            for index, word in enumerate(words)
        ]

    return None


def _parse_lemmas_response(raw_response: str, words: list[str]) -> tuple[list[str], str]:
    candidates: list[tuple[str, str]] = []
    stripped = strip_json_fences(raw_response)
    if stripped:
        candidates.append(("strip_json_fences", stripped))
    recovered = recover_json_payload(raw_response)
    if recovered and recovered != stripped:
        candidates.append(("recover_json_payload", recovered))

    strict_match = re.search(r'\{"lemmas":\s*\[.*?\]\}', raw_response, re.DOTALL)
    if strict_match:
        candidates.append(("strict_lemmas_regex", strict_match.group(0)))

    for source, candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        lemmas = _coerce_lemmas_from_payload(parsed, words)
        if lemmas:
            return lemmas, source

    local_fallback = [_local_lemmatize_word(word) for word in words]
    return local_fallback, "local_fallback"


SIMPLIFY_WORDS_SYSTEM_PROMPT = (
    "You are an English text simplifier for language learners.\n"
    "Given a sentence and a list of words/phrases to simplify from that sentence,\n"
    "return a JSON object with two fields:\n"
    "1. 'simplified_words': array of simplified replacements, IN THE SAME ORDER as the input list\n"
    "2. 'word_levels': object mapping each input word to its CEFR level you judged (e.g. {{'word': 'C1'}})\n"
    "\n"
    "## CRITICAL: EXACT i+1 Simplification Rule\n"
    "- Simplify words ONLY to {target_level} level — NOT simpler, NOT harder\n"
    "- For target B1: 'perusing' (B2) → 'reading' (B1), NOT 'looking at' (A1)\n"
    "- For target B1: 'ambulate' (C1) → 'walk' (B1), NOT 'move' (A1)\n"
    "- Oversimplification is WRONG: use a word at exactly {target_level}, not lower\n"
    "\n"
    "## CEFR Level Verification (MUST do first)\n"
    "Your FIRST task is to verify each word's CEFR level:\n"
    "- Look up the BASE FORM of each word (e.g. 'fixing' → base: 'fix')\n"
    "- If base form is at or below {target_level} → level = '{target_level}' (no simplification needed)\n"
    "- If base form exceeds {target_level} → assign actual level (B1, B2, C1, C2, etc.)\n"
    "\n"
    "## When to simplify (return a replacement at {target_level})\n"
    "- The word's base form genuinely exceeds {target_level} level\n"
    "- The replacement MUST be at EXACTLY {target_level} level\n"
    "\n"
    "## When to return \"\" (empty string — keep original)\n"
    "- Base form is at or below {target_level} (no simplification needed)\n"
    "- The context already clarifies the word's meaning adequately\n"
    "\n"
    "Rules:\n"
    "- Return ONLY a valid JSON object with 'simplified_words' and 'word_levels' — no markdown fences, no extra text\n"
    "- Each simplified_words entry must be at EXACTLY {target_level} level\n"
    "- Preserve the original meaning and part of speech where possible\n"
    "- Do NOT reorder — match input order exactly\n"
    "\n"
    "IMPORTANT: EXACT i+1 only. 'perusing' for B1 → 'reading', NOT 'looking at'. 'ambulate' for B1 → 'walk', NOT 'move'."
)

SIMPLIFY_WORDS_EXAMPLE = """
Example 1:
原文：I used to loathe and eschew perusing English.
目标等级：B1
每个词的词典标注等级：
loathe → B2
eschew → C1
perusing → B2
词义注释：
eschew = to deliberately avoid or abstain from something
perusing = to read carefully or in detail (NOT just "read")
返回：{"simplified_words": ["", "avoid", "reading carefully"], "word_levels": {"loathe": "A2", "eschew": "C1", "perusing": "B2"}}
解释：
- loathe (base: hate, A2) → base form 是 A2，B1 学习者已掌握 → 返回 ""
- eschew (base: eschew, C1) → C1 超 B1，且词义"刻意回避"≠普通 avoid，需要简化 → "avoid"
- perusing (base: peruse, B2) → B2 超 B1，词义"仔细阅读"≠普通 reading → "reading carefully"

Example 2:
原文：He was fixing the machine when I arrived.
目标等级：B1
每个词的词典标注等级：
fixing → B2
返回：{"simplified_words": [""], "word_levels": {"fixing": "A2"}}
解释：fixing 的 base 是 fix (A2)。B1 学习者已掌握 fix，所以不需要简化。

Example 3:
原文：The company announced a new initiative to peruse sustainable practices.
目标等级：B2
每个词的词典标注等级：
perusing → B2
词义注释：
perusing = to read carefully or in detail (NOT just "read")
返回：{"simplified_words": [""], "word_levels": {"perusing": "B2"}}
解释：peruse 本身是 B2，和目标 B2 同级，不需要简化。

Example 4:
原文：She was scrutinizing the contract closely.
目标等级：B1
每个词的词典标注等级：
scrutinizing → B2
词义注释：
scrutinizing = to examine or inspect closely and thoroughly
返回：{"simplified_words": ["studying carefully", ""], "word_levels": {"scrutinizing": "B2", "closely": "B1"}}
解释：
- scrutinizing → 词义"仔细审视"，需要简化 → "studying carefully"
- closely → 副词，无需简化
"""

FILTER_AND_SIMPLIFY_SYSTEM_PROMPT = (
    "You are an English language learning assistant helping learners read authentic content.\n"
    "\n"
    "## Your Task\n"
    "Given a sentence, a user's current level ({user_level}), and words identified by a vocabulary analyzer,\n"
    "you need to:\n"
    "\n"
    "1. **Verify each word**: Determine if it's truly appropriate as i+1 or above-i+1 vocabulary for this learner\n"
    "2. **Filter out mistakes**: Remove words that are actually too simple (user already knows them)\n"
    "3. **Simplify above-i+1 words**: Replace words above {target_level} with {target_level}-level equivalents\n"
    "\n"
    "## Definitions\n"
    "- **i+1 words** (target: {target_level}): These are appropriate learning targets. Keep them.\n"
    "- **above-i+1 words** (above {target_level}): Too difficult. Simplify to {target_level}.\n"
    "- **Too simple words**: The analyzer may mark A1/A2 words as difficult due to edge cases.\n"
    "  If a word is clearly within the user's existing knowledge (level ≤ {user_level}), mark it for removal.\n"
    "\n"
    "## Replacement Rules\n"
    "- Simplifications MUST be at EXACTLY {target_level} level\n"
    "- Can use single words OR short phrases (2-3 words max)\n"
    "- Preserve the original meaning and part of speech\n"
    "- Example: 'eschew' (C1) for B1 → 'avoid' (B1)\n"
    "- Example: 'perusing' (B2) for B1 → 'reading' (B1) or 'reading carefully' (B1 phrase)\n"
    "\n"
    "## Output Format\n"
    "Return ONLY a valid JSON object with these fields:\n"
    "{{\n"
    '  "valid_i1_words": ["word1", "word2"],      // Words at exactly {target_level} that are good learning targets\n'
    '  "valid_above_i1_words": ["word3"],          // Words above {target_level} that need simplification\n'
    '  "removed_words": [{{"word": "word4", "reason": "过于简单/词典误标"}}],  // Words to exclude from learning\n'
    '  "simplified_words": ["simple1"],            // Simplified replacements, one per valid_above_i1_words entry\n'
    '  "word_levels": {{"word1": "B2", "word3": "C1", "word4": "A2"}}  // Your judgment of each word\'s CEFR level\n'
    "}}\n"
    "\n"
    "## Important\n"
    "- valid_i1_words: Only words at EXACTLY {target_level}\n"
    "- valid_above_i1_words: Only words ABOVE {target_level} (these get simplified)\n"
    "- removed_words: Words that are actually too simple (≤ {user_level}) or shouldn't be learned\n"
    "- simplified_words: MUST have the same length as valid_above_i1_words, in the same order\n"
    "- Do NOT include words in multiple arrays\n"
)

FILTER_AND_SIMPLIFY_EXAMPLE = """
Example 1:
原文：I used to loathe and eschew perusing English.
用户等级：B1
目标等级：B2
词典标注：
loathe → B2
eschew → C1
perusing → B2

分析：
- loathe (B2) = 目标等级(B2) = i+1 → 保留
- eschew (C1) > 目标等级(B2) → 需要简化
- perusing (B2) = 目标等级(B2) = i+1 → 保留

返回：
{{
  "valid_i1_words": ["loathe", "perusing"],
  "valid_above_i1_words": ["eschew"],
  "removed_words": [],
  "simplified_words": ["avoid"],
  "word_levels": {{"loathe": "B2", "eschew": "C1", "perusing": "B2"}}
}}

Example 2:
原文：He was fixing the machine when I arrived.
用户等级：B1
目标等级：B2
词典标注：
fixing → B2

分析：
- fixing (base: fix, A2) → 词典标B2但实际是A2，≤用户等级B1 → 过于简单，移除

返回：
{{
  "valid_i1_words": [],
  "valid_above_i1_words": [],
  "removed_words": [{{"word": "fixing", "reason": "词典误标，实际为A2水平"}}],
  "simplified_words": [],
  "word_levels": {{"fixing": "A2"}}
}}

Example 3:
原文：The CEO announced a new initiative to scrutinize the budget carefully.
用户等级：B1
目标等级：B2
词典标注：
CEO → SUPER (专有名词)
announced → B1
new → A1
initiative → B2
scrutinize → B2
budget → B1
carefully → B2

分析：
- CEO → SUPER但实际是专有名词，用户无需学习 → 移除
- announced (B1) < 目标等级(B2) → 太简单，移除
- initiative (B2) = 目标等级(B2) = i+1 → 保留
- scrutinize (B2) = 目标等级(B2) = i+1 → 保留
- budget (B1) < 目标等级(B2) → 太简单，移除
- carefully (B2) = 目标等级(B2) = i+1 → 保留

返回：
{{
  "valid_i1_words": ["initiative", "scrutinize", "carefully"],
  "valid_above_i1_words": [],
  "removed_words": [
    {{"word": "CEO", "reason": "专有名词，无需学习"}},
    {{"word": "announced", "reason": "过于简单"}},
    {{"word": "budget", "reason": "过于简单"}}
  ],
  "simplified_words": [],
  "word_levels": {{"CEO": "SUPER", "announced": "B1", "initiative": "B2", "scrutinize": "B2", "budget": "B1", "carefully": "B2"}}
}}
"""

LEMMA_EXTRACTION_SYSTEM_PROMPT = (
    "You are an English vocabulary analyzer for language learning.\n"
    "Given a sentence and a list of words from that sentence, return the BASE FORM (lemma) of each word.\n"
    "Return ONLY a valid JSON object with a 'lemmas' array in the SAME ORDER as the input words.\n"
    "\n"
    "Rules:\n"
    "- Nouns: return singular form (transformations → transformation, phenomena → phenomenon)\n"
    "- Verbs: return infinitive form (transitions → transition, drew → draw)\n"
    "- Adjectives: return base form (happier → happy, beautiful → beautiful)\n"
    "- Adverbs: return base form (ultimately → finally/end, beautifully → beautiful)\n"
    "- If word is already base form, return as-is\n"
    "- Compound words: return the main root (workforce → work, household → house)\n"
    "\n"
    "Example:\n"
    "Input words: [transformation, drawbacks, ultimately, organizations, commuting]\n"
    'Output: {"lemmas": ["transform", "drawback", "finally", "organization", "commute"]}'
)


class FilterAndSimplifyRequest(BaseModel):
    """JSON body for POST /api/llm/filter-and-simplify-words."""

    sentence: str = Field(..., min_length=1)
    words: list[str] = Field(..., min_length=1, description="词典筛选出的候选词列表")
    word_levels: dict[str, str] | None = Field(default=None, description="词典标注的等级 {word: level}")
    target_level: str = Field(default="B1", max_length=8, description="目标等级（i+1）")
    user_level: str = Field(default="A2", max_length=8, description="用户当前等级（i）")
    enable_thinking: bool = False

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, value: str) -> str:
        if len(value) > 3000:
            raise ValueError("Sentence too long (max 3000 chars)")
        return value

    @field_validator("target_level", "user_level")
    @classmethod
    def validate_levels(cls, value: str) -> str:
        if value.upper() not in CEFR_LEVELS:
            raise ValueError(f"Invalid CEFR level '{value}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}")
        return value.upper()


class SimplifyWordsRequest(BaseModel):
    """JSON body for POST /api/llm/simplify-words."""

    sentence: str = Field(..., min_length=1)
    words: list[str] = Field(..., min_length=1)
    target_level: str = Field(default="B1", max_length=8)
    enable_thinking: bool = False
    word_levels: dict[str, str] | None = Field(default=None, description="每个词的 CEFR 等级，格式 {word: level}")

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, value: str) -> str:
        if len(value) > 2000:
            raise ValueError("Sentence too long (max 2000 chars)")
        return value

    @field_validator("word_levels")
    @classmethod
    def word_levels_validate(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return value
        valid_levels = {"A1", "A2", "B1", "B2", "C1", "C2", "SUPER"}
        for word, level in value.items():
            if level not in valid_levels:
                raise ValueError(
                    f"Invalid CEFR level '{level}' for word '{word}'. Must be one of: {', '.join(sorted(valid_levels))}"
                )
        return value


class ExtractLemmasRequest(BaseModel):
    """JSON body for POST /api/llm/extract-lemmas."""

    sentence: str = Field(..., min_length=1, max_length=3000)
    words: list[str] = Field(..., min_length=1)

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, value: str) -> str:
        if len(value) > 3000:
            raise ValueError("Sentence too long (max 3000 chars)")
        return value


@router.post(
    "/extract-lemmas",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def extract_lemmas_endpoint(
    body: ExtractLemmasRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Extract base forms (lemmas) from a list of words.
    Used to check if derived forms are based on vocabulary the user already knows.
    """
    llm_root = _llm_module()
    from app.services.llm_usage_service import log_llm_usage

    llm_root.ensure_default_billing_rates(db)

    try:
        rate = llm_root.get_model_rate(db, LLM_MODEL_DEEPSEEK_FAST)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = llm_root._require_api_key()
    trace_id = str(uuid.uuid4())
    words_list = "\n".join([f"{index + 1}. {word}" for index, word in enumerate(body.words)])
    user_message = (
        f"原文：{body.sentence}\n\n"
        f"需要还原的词列表：\n{words_list}\n\n"
        '返回 JSON 对象：{"lemmas": ["word1", "word2", ...]}\n'
        "lemmas 数组顺序必须与输入词列表顺序一致。"
    )
    messages = [
        {"role": "system", "content": LEMMA_EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.1,
            max_tokens=256,
        )
    except ValueError as exc:
        logger.warning("[DEBUG] llm.extract_lemmas_empty user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=503, detail=f"模型返回为空: {str(exc)[:100]}")
    except Exception as exc:
        logger.exception("[DEBUG] llm.extract_lemmas_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {str(exc)[:150]}")

    if not raw_response:
        raise HTTPException(status_code=503, detail="模型返回为空")

    lemmas, parse_source = _parse_lemmas_response(raw_response, body.words)
    if parse_source == "local_fallback":
        logger.warning(
            "[DEBUG] llm.extract_lemmas_local_fallback user_id=%s words=%s raw=%s",
            current_user.id,
            body.words,
            raw_response[:300],
        )
    elif parse_source != "strip_json_fences":
        logger.warning(
            "[DEBUG] llm.extract_lemmas_recovered user_id=%s source=%s words=%s",
            current_user.id,
            parse_source,
            body.words,
        )

    total_tokens = usage.prompt_tokens + usage.completion_tokens
    charge_cents = llm_root.calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    log_llm_usage(
        db=db,
        user_id=current_user.id,
        model_name=LLM_MODEL_DEEPSEEK_FAST,
        category="extract_lemmas",
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=False,
        input_text_preview=body.sentence[:200],
        trace_id=trace_id,
    )

    return {
        "ok": True,
        "lemmas": lemmas,
        "trace_id": trace_id,
    }


@router.post(
    "/simplify-words",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def simplify_words_endpoint(
    body: SimplifyWordsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Simplify a list of high-difficulty words/phrases from a given sentence.
    Returns a JSON array of simplified replacements, in the same order as the input.
    """
    llm_root = _llm_module()
    from app.services.llm_usage_service import log_llm_usage

    llm_root.ensure_default_billing_rates(db)
    if body.target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(status_code=422, detail=f"Invalid target_level '{body.target_level}'")
    if not body.words:
        raise HTTPException(status_code=422, detail="words must be non-empty list")
    if len(body.sentence) > 2000:
        raise HTTPException(status_code=413, detail="Sentence too long (max 2000 chars)")

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if body.enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = llm_root.get_model_rate(db, effective_model)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = llm_root._require_api_key()
    trace_id = str(uuid.uuid4())

    user_message_lines = [f"原文：{body.sentence}", f"目标等级：{body.target_level.upper()}"]
    if body.word_levels:
        user_message_lines.append("\n每个词的词典标注等级（供参考，你来判断是否真的需要简化）：")
        for word in body.words:
            level = body.word_levels.get(word.lower(), "?")
            user_message_lines.append(f"{word} → {level}")
        words_with_meanings = build_semantic_meaning_entries(body.words)
        if words_with_meanings:
            user_message_lines.append("\n以下词的语义注释：帮助你区分与简单近义词的细微差别：")
            user_message_lines.extend(words_with_meanings)

    user_message_lines.append(
        '\n返回 JSON 对象：{"simplified_words":[...], "word_levels":{...}}；'
        'simplified_words 与输入词顺序一致，"" 表示不简化；word_levels 的键为输入词（小写亦可）。'
    )
    user_message = "\n".join(user_message_lines)
    system_prompt = SIMPLIFY_WORDS_SYSTEM_PROMPT.format(target_level=body.target_level.upper()) + "\n\n" + SIMPLIFY_WORDS_EXAMPLE
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=body.enable_thinking,
            stream=False,
            temperature=0.3,
            max_tokens=512,
        )
    except ValueError as exc:
        logger.warning("[DEBUG] llm.simplify_words_empty user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=503, detail=f"模型返回为空，请稍后重试: {str(exc)[:100]}")
    except Exception as exc:
        logger.exception("[DEBUG] llm.simplify_words_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {str(exc)[:150]}")

    if not raw_response:
        raise HTTPException(status_code=503, detail="模型返回为空，请稍后重试")

    simplified_words: list[str] = []
    word_levels: dict[str, str] = {}
    parsed = None

    try:
        parsed = json.loads(strip_json_fences(raw_response))
        if isinstance(parsed, dict):
            if "simplified_words" not in parsed or not isinstance(parsed.get("simplified_words"), list):
                raise HTTPException(status_code=502, detail="Expected JSON object with 'simplified_words' array")
            simplified_words = [str(item) for item in parsed["simplified_words"]]
            raw_word_levels = parsed.get("word_levels")
            if raw_word_levels is not None and not isinstance(raw_word_levels, dict):
                raise HTTPException(status_code=502, detail="word_levels must be a JSON object")
            word_levels = {str(key): str(value) for key, value in (raw_word_levels or {}).items()}
        elif isinstance(parsed, list):
            simplified_words = [str(item) for item in parsed]
        else:
            raise HTTPException(status_code=502, detail="Expected JSON object with 'simplified_words' and 'word_levels'")
    except HTTPException:
        raise
    except Exception as exc:
        recovered = recover_json_payload(raw_response)
        if recovered:
            try:
                parsed = json.loads(recovered)
                logger.warning(
                    "[DEBUG] llm.simplify_words_recovered user_id=%s original_err=%s",
                    current_user.id,
                    str(exc)[:100],
                )
            except Exception:
                parsed = None
        if parsed is None:
            logger.warning(
                "[DEBUG] llm.simplify_words_parse_failed user_id=%s raw=%s error=%s",
                current_user.id,
                raw_response[:200],
                str(exc)[:100],
            )
            raise HTTPException(status_code=502, detail=f"模型响应格式错误，请稍后重试: {str(exc)[:80]}")
        if isinstance(parsed, dict):
            simplified_words = [str(item) for item in parsed.get("simplified_words", [])]
            raw_word_levels = parsed.get("word_levels")
            if isinstance(raw_word_levels, dict):
                word_levels = {str(key): str(value) for key, value in raw_word_levels.items()}
        elif isinstance(parsed, list):
            simplified_words = [str(item) for item in parsed]

    if len(simplified_words) != len(body.words):
        logger.warning(
            "[DEBUG] llm.simplify_words_count_mismatch user_id=%s expected=%s got=%s raw=%s",
            current_user.id,
            len(body.words),
            len(simplified_words),
            raw_response[:300],
        )
        raise HTTPException(
            status_code=502,
            detail=(
                f"simplified_words length {len(simplified_words)} does not match "
                f"input words length {len(body.words)}"
            ),
        )

    total_tokens = usage.prompt_tokens + usage.completion_tokens
    charge_cents = llm_root.calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        llm_root.consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=llm_root.EVENT_CONSUME_LLM,
            note=f"简化词汇，total_tokens={total_tokens}",
        )
    except Exception:
        pass

    log_llm_usage(
        db,
        user_id=current_user.id,
        model_name=effective_model,
        category="simplify_words",
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        total_tokens=total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=body.enable_thinking,
        input_text_preview=body.sentence[:200],
        trace_id=trace_id,
    )

    db.commit()

    return {
        "ok": True,
        "simplified_words": simplified_words,
        "word_levels": word_levels,
        "input_words": body.words,
        "model": effective_model,
        "usage": {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "reasoning_tokens": usage.reasoning_tokens,
            "total_tokens": total_tokens,
        },
        "charge_cents": charge_cents,
        "trace_id": trace_id,
    }


@router.post(
    "/filter-and-simplify-words",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def filter_and_simplify_words_endpoint(
    body: FilterAndSimplifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2: DeepSeek 二次筛选 + 重写

    接收词典初筛的候选词列表，返回：
    - valid_i1_words: 有效的 i+1 词汇（DeepSeek 验证通过）
    - valid_above_i1_words: 有效的 >i+1 词汇（需要且可以简化）
    - removed_words: 被过滤的词汇（过于简单或词典误标）
    - simplified_words: >i+1 词的重写版本（与 above_i1_words 一一对应）
    - word_levels: DeepSeek 重新判断的 CEFR 等级
    """
    try:
        return _do_filter_and_simplify(body, current_user, db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[filter-simplify] Unexpected error: %s", str(exc)[:500])
        raise HTTPException(status_code=500, detail=f"Internal error: {str(exc)[:100]}")


def _do_filter_and_simplify(body: FilterAndSimplifyRequest, current_user: User, db: Session):
    """实际的业务逻辑"""
    llm_root = _llm_module()
    from app.services.llm_usage_service import log_llm_usage

    logger.info("[filter-simplify] Starting request for user_id=%s, words_count=%d", current_user.id, len(body.words))
    llm_root.ensure_default_billing_rates(db)

    if body.target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(status_code=422, detail=f"Invalid target_level '{body.target_level}'")
    if body.user_level.upper() not in CEFR_LEVELS:
        raise HTTPException(status_code=422, detail=f"Invalid user_level '{body.user_level}'")
    if not body.words:
        raise HTTPException(status_code=422, detail="words must be non-empty list")
    if len(body.sentence) > 3000:
        raise HTTPException(status_code=413, detail="Sentence too long (max 3000 chars)")

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if body.enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = llm_root.get_model_rate(db, effective_model)
        logger.info("[filter-simplify] Got model rate for %s", effective_model)
    except Exception:
        logger.exception("[filter-simplify] get_model_rate failed")
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = llm_root._require_api_key()
    logger.info("[filter-simplify] API key OK")
    trace_id = str(uuid.uuid4())

    user_message_lines = [
        f"原文：{body.sentence}",
        f"用户等级：{body.user_level.upper()}",
        f"目标等级：{body.target_level.upper()}（即 i+1）",
    ]

    if body.word_levels:
        user_message_lines.append("\n词典标注等级：")
        for word in body.words:
            level = body.word_levels.get(word.lower(), "?")
            user_message_lines.append(f"{word} → {level}")
        words_with_meanings = build_semantic_meaning_entries(body.words)
        if words_with_meanings:
            user_message_lines.append("\n词义注释：")
            user_message_lines.extend(words_with_meanings)

    user_message_lines.append(
        '\n返回 JSON：{"valid_i1_words":[...],"valid_above_i1_words":[...],"removed_words":[...],"simplified_words":[...],"word_levels":{...}}'
    )
    user_message = "\n".join(user_message_lines)

    system_prompt = FILTER_AND_SIMPLIFY_SYSTEM_PROMPT.format(
        user_level=body.user_level.upper(),
        target_level=body.target_level.upper(),
    ) + "\n\n" + FILTER_AND_SIMPLIFY_EXAMPLE
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=body.enable_thinking,
            stream=False,
            temperature=0.3,
            max_tokens=768,
        )
        logger.info("[filter-simplify] LLM call succeeded, response length=%d", len(raw_response) if raw_response else 0)
    except ValueError as exc:
        logger.warning("[filter-simplify] Empty content after retries user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=503, detail=f"模型返回为空，请稍后重试: {str(exc)[:100]}")
    except Exception as exc:
        logger.exception("[filter-simplify] LLM call failed user_id=%s error=%s", current_user.id, str(exc)[:500])
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {str(exc)[:150]}")

    if not raw_response:
        logger.warning("[filter-simplify] Empty response for user_id=%s", current_user.id)
        raise HTTPException(status_code=503, detail="模型返回为空，请稍后重试")

    parsed = None
    try:
        parsed = json.loads(strip_json_fences(raw_response))
        logger.info("[filter-simplify] JSON parsed OK, keys=%s", list(parsed.keys()))
    except Exception as exc:
        cleaned = recover_json_payload(raw_response)
        if cleaned:
            try:
                parsed = json.loads(cleaned)
                logger.warning(
                    "[filter-simplify] JSON recovered after fix user_id=%s original_err=%s",
                    current_user.id,
                    str(exc)[:100],
                )
            except Exception:
                parsed = None
        if parsed is None:
            logger.warning(
                "[filter-simplify] JSON parse failed user_id=%s raw=%s error=%s",
                current_user.id,
                raw_response[:300],
                str(exc)[:200],
            )
            raise HTTPException(status_code=502, detail=f"模型响应格式错误，请稍后重试: {str(exc)[:80]}")

    valid_i1_words = parsed.get("valid_i1_words", [])
    valid_above_i1_words = parsed.get("valid_above_i1_words", [])
    removed_words = parsed.get("removed_words", [])
    simplified_words = parsed.get("simplified_words", [])
    word_levels = parsed.get("word_levels", {})

    if len(simplified_words) != len(valid_above_i1_words):
        logger.warning(
            "[DEBUG] llm.filter_simplify_count_mismatch user_id=%s above_i1=%s simplified=%s",
            current_user.id,
            len(valid_above_i1_words),
            len(simplified_words),
        )
        if len(simplified_words) > len(valid_above_i1_words):
            simplified_words = simplified_words[: len(valid_above_i1_words)]
        else:
            simplified_words = simplified_words + [""] * (len(valid_above_i1_words) - len(simplified_words))

    total_tokens = usage.prompt_tokens + usage.completion_tokens
    charge_cents = llm_root.calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        llm_root.consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=llm_root.EVENT_CONSUME_LLM,
            note=f"筛选并简化词汇，total_tokens={total_tokens}",
        )
    except Exception:
        pass

    try:
        log_llm_usage(
            db,
            user_id=current_user.id,
            model_name=effective_model,
            category="simplify",
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            reasoning_tokens=usage.reasoning_tokens,
            total_tokens=total_tokens,
            input_cost_cents=None,
            charge_cents=charge_cents,
            lesson_id=None,
            enable_thinking=body.enable_thinking,
            input_text_preview=body.sentence[:200],
            trace_id=trace_id,
        )
        db.commit()
        logger.info("[filter-simplify] Success for user_id=%s", current_user.id)
    except Exception:
        logger.exception("[filter-simplify] post-processing failed")

    return {
        "ok": True,
        "valid_i1_words": valid_i1_words,
        "valid_above_i1_words": valid_above_i1_words,
        "removed_words": removed_words,
        "simplified_words": simplified_words,
        "word_levels": word_levels,
        "input_words": body.words,
        "model": effective_model,
        "usage": {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "reasoning_tokens": usage.reasoning_tokens,
            "total_tokens": total_tokens,
        },
        "charge_cents": charge_cents,
        "trace_id": trace_id,
    }
