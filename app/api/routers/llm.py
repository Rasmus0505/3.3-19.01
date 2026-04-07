"""
LLM API Router — DeepSeek V3.2 endpoints for reading material generation.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.config import DASHSCOPE_API_KEY
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive
from app.db import get_db
from app.infra.llm.deepseek import call_deepseek, generate_reading_material
from app.models import User
from app.schemas import ErrorResponse
from app.services.billing_service import (
    EVENT_CONSUME_LLM,
    calculate_llm_charge_by_tokens,
    consume_points,
    ensure_default_billing_rates,
    get_model_rate,
)
from app.services.llm_usage_service import get_llm_usage_summary, list_user_llm_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])

LLM_MODEL_DEEPSEEK_THINKING = "deepseek-v3.2"
LLM_MODEL_DEEPSEEK_FAST = "deepseek-v3.2"
LLM_VALID_MODELS = {"deepseek-v3.2"}  # 你的 API Key 只有 deepseek-v3.2 的访问权限
CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}


def _require_api_key() -> str:
    key = DASHSCOPE_API_KEY
    if not key or not str(key).strip():
        raise HTTPException(status_code=503, detail="LLM API key not configured")
    return str(key).strip()


@router.post(
    "/generate-reading-material",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def generate_reading_material_endpoint(
    words: list[dict[str, Any]],
    target_level: str = Query(default="A2", max_length=4),
    enable_thinking: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate reading material from word list using DeepSeek V3.2.
    Charges the user according to the selected model rate.
    """
    # 确保计费配置已初始化
    ensure_default_billing_rates(db)

    if target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid target_level '{target_level}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}",
        )

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = get_model_rate(db, effective_model)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    if not words or not isinstance(words, list):
        raise HTTPException(status_code=422, detail="words must be a non-empty list")

    api_key = _require_api_key()
    trace_id = str(uuid.uuid4())

    try:
        results = list(
            generate_reading_material(
                user_words=words,
                target_level=target_level.upper(),
                enable_thinking=enable_thinking,
                api_key=api_key,
            )
        )
    except Exception as exc:
        logger.exception("[DEBUG] llm.generate_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM call failed: {str(exc)[:200]}")

    if not results:
        raise HTTPException(status_code=502, detail="LLM returned empty result")

    content, usage = results[0]
    total_tokens = usage.prompt_tokens + usage.completion_tokens

    from app.services.billing_service import calculate_llm_charge_by_tokens

    charge_cents = calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=EVENT_CONSUME_LLM,
            note=f"生成阅读材料，total_tokens={total_tokens}, enable_thinking={enable_thinking}",
        )
    except Exception as exc:
        logger.warning(
            "[DEBUG] llm.consume_failed user_id=%s charge_cents=%s error=%s",
            current_user.id,
            charge_cents,
            str(exc)[:200],
        )

    from app.services.llm_usage_service import log_llm_usage

    log_llm_usage(
        db,
        user_id=current_user.id,
        model_name=effective_model,
        category="llm",
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        total_tokens=total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=enable_thinking,
        input_text_preview="",
        trace_id=trace_id,
    )

    db.commit()

    return {
        "ok": True,
        "content": content,
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


@router.get("/usage")
def list_llm_usage_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List current user's LLM usage records.
    """
    rows, total = list_user_llm_usage(
        db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
        category=category,
    )
    return {
        "ok": True,
        "records": [
            {
                "id": r.id,
                "trace_id": r.trace_id,
                "category": r.category,
                "model_name": r.model_name,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "reasoning_tokens": r.reasoning_tokens,
                "total_tokens": r.total_tokens,
                "input_cost_cents": r.input_cost_cents,
                "charge_cents": r.charge_cents,
                "gross_profit_cents": r.gross_profit_cents,
                "enable_thinking": r.enable_thinking,
                "lesson_id": r.lesson_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/models")
def list_llm_models_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List available LLM models with pricing.
    """
    models = []
    for model_name in sorted(LLM_VALID_MODELS):
        try:
            rate = get_model_rate(db, model_name)
            models.append({
                "model_name": model_name,
                "display_name": (
                    "DeepSeek V3.2 (思考模式)"
                    if model_name == LLM_MODEL_DEEPSEEK_THINKING
                    else "DeepSeek V3.2 (快速模式)"
                ),
                "enable_thinking": model_name == LLM_MODEL_DEEPSEEK_THINKING,
                "points_per_1k_tokens": rate.points_per_1k_tokens,
                "price_per_1k_tokens_yuan": rate.points_per_1k_tokens / 100.0,
                "cost_per_1k_tokens_input_cents": rate.cost_per_1k_tokens_input_cents,
                "cost_per_1k_tokens_output_cents": rate.cost_per_1k_tokens_output_cents,
                "is_active": rate.is_active,
            })
        except Exception:
            pass
    return {"ok": True, "models": models}


# ── 新 Schema Prompt（简化词数组，按顺序）──────────────────────────────
COMMON_SIMPLIFY_WORD_MEANINGS: dict[str, str] = {
    "peruse": 'to read carefully or in detail (NOT just "read")',
    "eschew": "to deliberately avoid or abstain from something",
    "adverse": "preventing success or development; harmful (NOT just different)",
    "affluent": "having a great deal of money; wealthy (NOT just full)",
    "ambiguous": "open to more than one interpretation; unclear",
    "coherent": "logical and consistent; clear (NOT just together)",
    "concurrent": "existing or happening at the same time",
    "correlate": "to have a mutual relationship or connection",
    "diligent": "having or showing care and conscientiousness in one's work",
    "eloquent": "fluent or persuasive in speaking or writing",
    "feasible": "possible to do easily or conveniently",
    "imminent": "about to happen (NOT just important)",
    "implicit": "implied though not plainly expressed",
    "inherent": "existing in something as a permanent characteristic",
    "innovative": "introducing new ideas; original",
    "obsolete": "no longer produced or used; out of date",
    "phenomenon": "a fact or situation that is observed to exist or happen",
    "pragmatic": "dealing with things sensibly and realistically (NOT just practical)",
    "scrutinize": "to examine or inspect closely and thoroughly",
    "subsequent": "coming after something in time; following",
    "superficial": "existing or occurring on the surface; not deep",
    "ubiquitous": "present, appearing, or found everywhere",
    "viable": "capable of working successfully; feasible",
}

# ── 新 Schema Prompt（简化词数组，按顺序）──────────────────────────────
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


# ── 新流程 Prompt（Step 2：二次筛选 + 重写）────────────────────────────
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


class FilterAndSimplifyRequest(BaseModel):
    """JSON body for POST /api/llm/filter-and-simplify-words."""
    sentence: str = Field(..., min_length=1)
    words: list[str] = Field(..., min_length=1, description="词典筛选出的候选词列表")
    word_levels: dict[str, str] | None = Field(
        default=None,
        description="词典标注的等级 {word: level}",
    )
    target_level: str = Field(default="B1", max_length=8, description="目标等级（i+1）")
    user_level: str = Field(default="A2", max_length=8, description="用户当前等级（i）")
    enable_thinking: bool = False

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, v: str) -> str:
        if len(v) > 3000:
            raise ValueError("Sentence too long (max 3000 chars)")
        return v

    @field_validator("target_level", "user_level")
    @classmethod
    def validate_levels(cls, v: str) -> str:
        if v.upper() not in CEFR_LEVELS:
            raise ValueError(f"Invalid CEFR level '{v}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}")
        return v.upper()


class SimplifyWordsRequest(BaseModel):
    """JSON body for POST /api/llm/simplify-words."""
    sentence: str = Field(..., min_length=1)
    words: list[str] = Field(..., min_length=1)
    target_level: str = Field(default="B1", max_length=8)
    enable_thinking: bool = False
    word_levels: dict[str, str] | None = Field(
        default=None,
        description="每个词的 CEFR 等级，格式 {word: level}",
    )

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, v: str) -> str:
        if len(v) > 2000:
            raise ValueError("Sentence too long (max 2000 chars)")
        return v

    @field_validator("word_levels")
    @classmethod
    def word_levels_validate(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return v
        valid_levels = {"A1", "A2", "B1", "B2", "C1", "C2", "SUPER"}
        for word, level in v.items():
            if level not in valid_levels:
                raise ValueError(f"Invalid CEFR level '{level}' for word '{word}'. Must be one of: {', '.join(sorted(valid_levels))}")
        return v


# ── 词形还原 Prompt ─────────────────────────────────────────────────────────
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
    "Output: {\"lemmas\": [\"transform\", \"drawback\", \"finally\", \"organization\", \"commute\"]}"
)


class ExtractLemmasRequest(BaseModel):
    """JSON body for POST /api/llm/extract-lemmas."""
    sentence: str = Field(..., min_length=1, max_length=3000)
    words: list[str] = Field(..., min_length=1)

    @field_validator("sentence")
    @classmethod
    def sentence_max_length(cls, v: str) -> str:
        if len(v) > 3000:
            raise ValueError("Sentence too long (max 3000 chars)")
        return v


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
    ensure_default_billing_rates(db)

    try:
        rate = get_model_rate(db, LLM_MODEL_DEEPSEEK_FAST)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = _require_api_key()
    trace_id = str(uuid.uuid4())

    # 构建用户消息
    words_list = "\n".join([f"{i+1}. {w}" for i, w in enumerate(body.words)])
    user_message = (
        f"原文：{body.sentence}\n\n"
        f"需要还原的词列表：\n{words_list}\n\n"
        f"返回 JSON 对象：{{\"lemmas\": [\"word1\", \"word2\", ...]}}\n"
        f"lemmas 数组顺序必须与输入词列表顺序一致。"
    )

    messages = [
        {"role": "system", "content": LEMMA_EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        raw_response, usage = call_deepseek(
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

    import json as _json
    import re as _re

    def _strip_json_fences(text: str) -> str:
        s = text.strip()
        fence = _re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", s, flags=_re.DOTALL | _re.IGNORECASE)
        if fence:
            return fence.group(1).strip()
        return s

    try:
        parsed = _json.loads(_strip_json_fences(raw_response))
        if not isinstance(parsed, dict) or "lemmas" not in parsed:
            raise HTTPException(status_code=502, detail="Expected JSON object with 'lemmas' array")
        lemmas = [str(item) for item in parsed["lemmas"]]
        if len(lemmas) != len(body.words):
            raise HTTPException(
                status_code=502,
                detail=f"lemmas count ({len(lemmas)}) != words count ({len(body.words)})"
            )
    except HTTPException:
        raise
    except Exception:
        # 尝试从响应中提取 JSON
        m = _re.search(r'\{"lemmas":\s*\[.*?\]\}', raw_response, _re.DOTALL)
        if m:
            try:
                parsed = _json.loads(m.group(0))
                lemmas = [str(item) for item in parsed["lemmas"]]
            except Exception:
                raise HTTPException(status_code=502, detail="无法解析 LLM 返回的 JSON")
        else:
            raise HTTPException(status_code=502, detail="LLM 返回格式错误")

    # 记录 LLM 使用
    from app.services.billing_service import calculate_llm_charge_by_tokens
    from app.services.llm_usage_service import log_llm_usage

    total_tokens = usage.prompt_tokens + usage.completion_tokens
    charge_cents = calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    log_llm_usage(
        db=db,
        user_id=current_user.id,
        model=LLM_MODEL_DEEPSEEK_FAST,
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


@router.get("/estimate-tokens")
def estimate_tokens_endpoint(
    text: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    """
    估算给定文本的 token 数量（用于在重写前显示费用估算）。
    使用简单估算：英文约 4 字符/token。
    """
    from app.db.session import SessionLocal

    char_count = len(text)
    estimated_tokens = max(1, char_count // 4)
    prompt_est = estimated_tokens
    completion_est = estimated_tokens // 2
    total_est = prompt_est + completion_est

    db = SessionLocal()
    try:
        rate = get_model_rate(db, "deepseek-v3.2")
        est_charge = int(total_est * rate.points_per_1k_tokens / 10)
    except Exception:
        est_charge = int(total_est * 5)
    finally:
        db.close()

    return {
        "ok": True,
        "char_count": char_count,
        "estimated_tokens": total_est,
        "estimated_charge_cents": est_charge,
        "estimated_charge_yuan": est_charge / 100.0,
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

    新 Schema（Phase 34）: 发送高难度词列表 → 只返回简化词数组
    """
    ensure_default_billing_rates(db)
    if body.target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(status_code=422, detail=f"Invalid target_level '{body.target_level}'")
    if not body.words:
        raise HTTPException(status_code=422, detail="words must be non-empty list")
    if len(body.sentence) > 2000:
        raise HTTPException(status_code=413, detail="Sentence too long (max 2000 chars)")

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if body.enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = get_model_rate(db, effective_model)
    except Exception:
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = _require_api_key()
    trace_id = str(uuid.uuid4())

    user_message_lines = [f"原文：{body.sentence}", f"目标等级：{body.target_level.upper()}"]
    if body.word_levels:
        user_message_lines.append("\n每个词的词典标注等级（供参考，你来判断是否真的需要简化）：")
        for word in body.words:
            level = body.word_levels.get(word.lower(), "?")
            user_message_lines.append(f"{word} → {level}")

        # Inject semantic meanings for frequently-misunderstood words
        words_with_meanings = []
        for word in body.words:
            base = word.lower()
            for suffix, repl in [("ing", ""), ("es", ""), ("ed", ""), ("s", "")]:
                if base.endswith(suffix) and len(base) > len(suffix) + 2:
                    candidate = base[:-len(suffix)] + repl
                    if candidate in COMMON_SIMPLIFY_WORD_MEANINGS:
                        base = candidate
                    break
            meaning = COMMON_SIMPLIFY_WORD_MEANINGS.get(base)
            if meaning:
                words_with_meanings.append(f"{word} = {meaning}")
        if words_with_meanings:
            user_message_lines.append(
                "\n以下词的语义注释：帮助你区分与简单近义词的细微差别："
            )
            for entry in words_with_meanings:
                user_message_lines.append(entry)

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
        raw_response, usage = call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=body.enable_thinking,
            stream=False,
            temperature=0.3,
            max_tokens=512,
        )
    except ValueError as exc:
        # Raised by call_deepseek when content is empty after retries
        logger.warning("[DEBUG] llm.simplify_words_empty user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=503, detail=f"模型返回为空，请稍后重试: {str(exc)[:100]}")
    except Exception as exc:
        logger.exception("[DEBUG] llm.simplify_words_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {str(exc)[:150]}")

    if not raw_response:
        raise HTTPException(status_code=503, detail="模型返回为空，请稍后重试")

    import json as _json
    import re as _re

    def _strip_llm_json_fences(text: str) -> str:
        """Remove optional ```json ... ``` wrappers so json.loads succeeds."""
        s = text.strip()
        fence = _re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", s, flags=_re.DOTALL | _re.IGNORECASE)
        if fence:
            return fence.group(1).strip()
        return s

    simplified_words: list[str] = []
    word_levels: dict[str, str] = {}

    def _recover_json_fallback(text: str) -> str | None:
        if not text:
            return None
        s = text.strip()
        fence = _re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", s, flags=_re.DOTALL | _re.IGNORECASE)
        if fence:
            s = fence.group(1).strip()
        for pattern, flags in [
            (r'\{[\s\S]*\}', _re.DOTALL),
            (r'\[[\s\S]*\]', _re.DOTALL),
        ]:
            m = _re.search(pattern, s, flags)
            if m:
                candidate = m.group(0)
                last_complete = None
                depth = 0
                for i in range(len(candidate)):
                    c = candidate[i]
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                        if depth == 0:
                            last_complete = i
                if last_complete is not None and last_complete + 1 < len(candidate):
                    candidate = candidate[:last_complete + 1]
                try:
                    _json.loads(candidate)
                    return candidate
                except Exception:
                    pass
        return None

    try:
        parsed = _json.loads(_strip_llm_json_fences(raw_response))
        if isinstance(parsed, dict):
            if "simplified_words" not in parsed or not isinstance(parsed.get("simplified_words"), list):
                raise HTTPException(
                    status_code=502,
                    detail="Expected JSON object with 'simplified_words' array",
                )
            simplified_words = [str(item) for item in parsed["simplified_words"]]
            wl_raw = parsed.get("word_levels")
            if wl_raw is not None and not isinstance(wl_raw, dict):
                raise HTTPException(status_code=502, detail="word_levels must be a JSON object")
            word_levels = (
                {str(k): str(v) for k, v in wl_raw.items()} if isinstance(wl_raw, dict) else {}
            )
        elif isinstance(parsed, list):
            # 兼容旧格式
            simplified_words = [str(item) for item in parsed]
        else:
            raise HTTPException(status_code=502, detail="Expected JSON object with 'simplified_words' and 'word_levels'")
    except HTTPException:
        raise
    except Exception as exc:
        recovered = _recover_json_fallback(raw_response)
        if recovered:
            try:
                parsed = _json.loads(recovered)
                logger.warning(
                    "[DEBUG] llm.simplify_words_recovered user_id=%s original_err=%s",
                    current_user.id, str(exc)[:100]
                )
            except Exception:
                parsed = None
        if not parsed:
            logger.warning("[DEBUG] llm.simplify_words_parse_failed user_id=%s raw=%s error=%s",
                           current_user.id, raw_response[:200], str(exc)[:100])
            raise HTTPException(status_code=502, detail=f"模型响应格式错误，请稍后重试: {str(exc)[:80]}")

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
    charge_cents = calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=EVENT_CONSUME_LLM,
            note=f"简化词汇，total_tokens={total_tokens}",
        )
    except Exception:
        pass

    from app.services.llm_usage_service import log_llm_usage
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
        "word_levels": word_levels,  # DeepSeek 判断的 CEFR 等级
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
    except Exception as e:
        logger.exception("[filter-simplify] Unexpected error: %s", str(e)[:500])
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)[:100]}")


def _do_filter_and_simplify(body: FilterAndSimplifyRequest, current_user: User, db: Session):
    """实际的业务逻辑"""
    logger.info("[filter-simplify] Starting request for user_id=%s, words_count=%d", current_user.id, len(body.words))
    try:
        ensure_default_billing_rates(db)
    except Exception as e:
        logger.exception("[filter-simplify] ensure_default_billing_rates failed")
        raise

    # 验证参数
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
        rate = get_model_rate(db, effective_model)
        logger.info("[filter-simplify] Got model rate for %s", effective_model)
    except Exception as e:
        logger.exception("[filter-simplify] get_model_rate failed")
        raise HTTPException(status_code=503, detail="LLM model not available")

    try:
        api_key = _require_api_key()
        logger.info("[filter-simplify] API key OK")
    except Exception as e:
        logger.exception("[filter-simplify] _require_api_key failed")
        raise

    trace_id = str(uuid.uuid4())

    # 构建用户消息
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

        # Inject semantic meanings
        words_with_meanings = []
        for word in body.words:
            base = word.lower()
            for suffix, repl in [("ing", ""), ("es", ""), ("ed", ""), ("s", "")]:
                if base.endswith(suffix) and len(base) > len(suffix) + 2:
                    candidate = base[:-len(suffix)] + repl
                    if candidate in COMMON_SIMPLIFY_WORD_MEANINGS:
                        base = candidate
                    break
            meaning = COMMON_SIMPLIFY_WORD_MEANINGS.get(base)
            if meaning:
                words_with_meanings.append(f"{word} = {meaning}")
        if words_with_meanings:
            user_message_lines.append("\n词义注释：")
            for entry in words_with_meanings:
                user_message_lines.append(entry)

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
        raw_response, usage = call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=body.enable_thinking,
            stream=False,
            temperature=0.3,
            max_tokens=768,
        )
        logger.info("[filter-simplify] LLM call succeeded, response length=%d", len(raw_response) if raw_response else 0)
    except ValueError as exc:
        # Raised by call_deepseek when content is empty after retries
        logger.warning("[filter-simplify] Empty content after retries user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=503, detail=f"模型返回为空，请稍后重试: {str(exc)[:100]}")
    except Exception as exc:
        logger.exception("[filter-simplify] LLM call failed user_id=%s error=%s", current_user.id, str(exc)[:500])
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {str(exc)[:150]}")

    if not raw_response:
        logger.warning("[filter-simplify] Empty response for user_id=%s", current_user.id)
        raise HTTPException(status_code=503, detail="模型返回为空，请稍后重试")

    # 解析响应
    import json as _json
    import re as _re

    def _strip_json_fences(text: str) -> str:
        s = text.strip()
        fence = _re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", s, flags=_re.DOTALL | _re.IGNORECASE)
        if fence:
            return fence.group(1).strip()
        return s

    def _try_recover_json(text: str) -> str | None:
        """尝试修复被截断、含非法字符或格式混乱的 JSON 字符串"""
        if not text:
            return None

        # 移除 markdown 代码块标记
        s = text.strip()
        fence = _re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", s, flags=_re.DOTALL | _re.IGNORECASE)
        if fence:
            s = fence.group(1).strip()

        # 尝试用更宽松的 regex 找到 JSON 对象/数组
        for pattern, flags in [
            (r'\{[\s\S]*\}', _re.DOTALL),
            (r'\[[\s\S]*\]', _re.DOTALL),
        ]:
            m = _re.search(pattern, s, flags)
            if m:
                candidate = m.group(0)
                # 去掉末尾可能被截断的字段（逗号后无值、字符串未闭合等）
                # 常见截断：..., "word": " vie error=...
                # 把最后一个不完整的键值对截掉
                # 策略：从后往前找最后一个完整的 }, 截断后面的内容
                last_complete = None
                depth = 0
                for i in range(len(candidate)):
                    c = candidate[i]
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                        if depth == 0:
                            last_complete = i
                if last_complete is not None and last_complete + 1 < len(candidate):
                    candidate = candidate[:last_complete + 1]
                # 尝试解析
                try:
                    _json.loads(candidate)
                    return candidate
                except Exception:
                    pass
        return None

    parsed = None
    try:
        parsed = _json.loads(_strip_json_fences(raw_response))
        logger.info("[filter-simplify] JSON parsed OK, keys=%s", list(parsed.keys()))
    except Exception as exc:
        # 容错尝试：处理 markdown 代码块后多余换行、被截断的 JSON、非法字符
        cleaned = _try_recover_json(_strip_json_fences(raw_response))
        if cleaned:
            try:
                parsed = _json.loads(cleaned)
                logger.warning(
                    "[filter-simplify] JSON recovered after fix user_id=%s original_err=%s",
                    current_user.id, str(exc)[:100]
                )
            except Exception:
                parsed = None
        if not parsed:
            logger.warning(
                "[filter-simplify] JSON parse failed user_id=%s raw=%s error=%s",
                current_user.id, raw_response[:300], str(exc)[:200]
            )
            raise HTTPException(status_code=502, detail=f"模型响应格式错误，请稍后重试: {str(exc)[:80]}")

    # 提取各字段
    valid_i1_words = parsed.get("valid_i1_words", [])
    valid_above_i1_words = parsed.get("valid_above_i1_words", [])
    removed_words = parsed.get("removed_words", [])
    simplified_words = parsed.get("simplified_words", [])
    word_levels = parsed.get("word_levels", {})

    # 验证 simplified_words 和 valid_above_i1_words 长度一致
    if len(simplified_words) != len(valid_above_i1_words):
        logger.warning(
            "[DEBUG] llm.filter_simplify_count_mismatch user_id=%s above_i1=%s simplified=%s",
            current_user.id, len(valid_above_i1_words), len(simplified_words)
        )
        # 调整长度，丢弃多余的
        if len(simplified_words) > len(valid_above_i1_words):
            simplified_words = simplified_words[:len(valid_above_i1_words)]
        else:
            # 补空字符串
            simplified_words = simplified_words + [""] * (len(valid_above_i1_words) - len(simplified_words))

    # 计算费用
    total_tokens = usage.prompt_tokens + usage.completion_tokens
    charge_cents = calculate_llm_charge_by_tokens(
        total_tokens=total_tokens,
        points_per_1k_tokens=rate.points_per_1k_tokens,
    )

    try:
        consume_points(
            db,
            user_id=current_user.id,
            points=charge_cents,
            model_name=effective_model,
            lesson_id=None,
            event_type=EVENT_CONSUME_LLM,
            note=f"筛选并简化词汇，total_tokens={total_tokens}",
        )
    except Exception:
        pass

    from app.services.llm_usage_service import log_llm_usage
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
    except Exception as e:
        logger.exception("[filter-simplify] post-processing failed")
        # 不抛出异常，让请求继续返回成功

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
