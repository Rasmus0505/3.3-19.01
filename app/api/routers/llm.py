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


class RewriteTextRequest(BaseModel):
    """JSON body for POST /rewrite-text (matches frontend useReadingRewrite)."""

    text: str = Field(..., min_length=1)
    target_level: str = Field(default="B1", max_length=8)
    enable_thinking: bool = False
    include_mappings: bool = Field(default=False, description="If true, return word/phrase rewrite mappings as JSON alongside rewritten text.")


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


# ============================================================
# 原有的阅读材料生成接口
# ============================================================

REWRITE_SYSTEM_PROMPT = (
    "You are an English text simplifier for language learners.\n"
    "Rewrite the given text at CEFR {target_level} level.\n"
    "Rules:\n"
    "- Replace complex vocabulary with simpler CEFR {target_level} equivalents\n"
    "- Keep sentence structure clear and understandable\n"
    "- Preserve the original meaning and key information\n"
    "- Output only the rewritten text, no explanations or markers\n"
    "- Keep approximately the same length as the original\n"
)

REWRITE_WITH_MAPPINGS_SYSTEM_PROMPT = (
    "You are an English text simplifier for language learners.\n"
    "Rewrite the given text at CEFR {target_level} level.\n"
    "Rules:\n"
    "- Replace complex vocabulary with simpler CEFR {target_level} equivalents\n"
    "- Keep sentence structure clear and understandable\n"
    "- Preserve the original meaning and key information\n"
    "- Keep approximately the same length as the original\n"
    "\n"
    "IMPORTANT: Output STRICTLY valid JSON with no markdown fences or extra text:\n"
    '{{"rewritten_text": "...", "rewrite_mappings": [{{"original": "...", "rewritten": "..."}}, ...]}}\n'
    "Each mapping entry must map one simplified word/phrase from the rewritten text back to the exact original word or phrase it replaced."
)

REWRITE_MAX_INPUT_CHARS = 12000
REWRITE_MAX_OUTPUT_TOKENS = 2048
REWRITE_MAX_INPUT_TOKENS = 3000

# ── 新 Schema Prompt（简化词数组，按顺序）──────────────────────────────
SIMPLIFY_WORDS_SYSTEM_PROMPT = (
    "You are an English text simplifier for language learners.\n"
    "Given a sentence and a list of words/phrases to simplify from that sentence,\n"
    "return a JSON array of simplified replacements, IN THE SAME ORDER as the input list.\n"
    "Rules:\n"
    "- Return ONLY a valid JSON array of strings — no markdown fences, no extra text\n"
    "- Each entry must be a concise simplified word or phrase for the corresponding input\n"
    "- Preserve the original meaning and part of speech where possible\n"
    "- Do NOT reorder the array entries — match input order exactly\n"
    "\n"
    "## CEFR Level Verification (MUST do first before simplifying)\n"
    "You will receive each word's CEFR level from a dictionary (e.g. 'fixing → B2').\n"
    "Your FIRST task is to verify whether the dictionary level is accurate:\n"
    "- Look up the BASE FORM of each word (e.g. 'fixing' → base: 'fix').\n"
    "- If the base form is A1-A2 level (e.g. 'fix' is A2), the word is EASILY understood by a {target_level} learner — return \"\" even if the dictionary says B2.\n"
    "- If the base form is already at or below {target_level} level, return \"\" — the word does NOT need simplifying.\n"
    "- Only simplify words whose BASE FORM genuinely exceeds the {target_level} level.\n"
    "\n"
    "## When to simplify (return a replacement)\n"
    "- The word's base form is above {target_level} level (e.g. 'perusing' base: 'peruse' = B2, for target B1 → YES, simplify)\n"
    "- The word's meaning in THIS specific context requires a simpler alternative to be understood\n"
    "\n"
    "## When to return \"\" (empty string — keep original)\n"
    "- The dictionary level is HIGHER than the base form level (dictionary overestimates difficulty)\n"
    "- The base form is A1-A2 and the learner already knows it\n"
    "- The context already clarifies the word's meaning adequately\n"
    "\n"
    "IMPORTANT: Always check the BASE FORM first. Return \"\" when the base form is at or below the {target_level} level, even if the dictionary CEFR tag is higher."
)

SIMPLIFY_WORDS_EXAMPLE = """
Example 1:
原文：I used to loathe and eschew perusing English.
目标等级：B1
每个词的词典标注等级：
loathe → B2
eschew → C1
perusing → B2
返回：["hate", "", "reading carefully"]
解释：
- loathe (base: hate, A2) → 词典 B2，但 base form 是 A2，B1 学习者已掌握 → 返回 "" ❌ 但示例说是简化... 这个示例有问题，让我按正确逻辑：
- loathe (base: hate, A2) → base 是 A2，返回 "" ❌
- eschew (base: eschew, C1) → base C1 超 B1，需要简化
- perusing (base: peruse, B2) → base B2 超 B1，需要简化
正确返回：["", "avoid", "reading"]

Example 2:
原文：He was fixing the machine when I arrived.
目标等级：B1
每个词的词典标注等级：
fixing → B2
返回：[""]
解释：fixing 的 base 是 fix (A2)。B1 学习者已掌握 fix，所以不需要简化。

Example 3:
原文：The company announced a new initiative to peruse sustainable practices.
目标等级：B2
每个词的词典标注等级：
peruse → B1
返回：[""]
解释：peruse 本身是 B1（细读），对于 B2 学习者不需要简化。词典判断准确。
"""


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
    user_message_lines.append(f"\n返回 JSON 数组（每个词对应一个简化词，或 \"\" 表示不需要简化）：")
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
    except Exception as exc:
        logger.exception("[DEBUG] llm.simplify_words_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM call failed: {str(exc)[:200]}")

    if not raw_response:
        raise HTTPException(status_code=502, detail="LLM returned empty result")

    import json as _json
    simplified_words: list[str] = []
    try:
        parsed = _json.loads(raw_response.strip())
        if isinstance(parsed, list):
            simplified_words = [str(item) for item in parsed]
        else:
            raise HTTPException(status_code=502, detail="Expected JSON array, got other type")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("[DEBUG] llm.simplify_words_parse_failed user_id=%s raw=%s error=%s",
                       current_user.id, raw_response[:200], str(exc)[:100])
        raise HTTPException(status_code=502, detail=f"Failed to parse model response: {str(exc)[:100]}")

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
    "/rewrite-text",
    responses={503: {"model": ErrorResponse}, 402: {"model": ErrorResponse}},
)
def rewrite_text_endpoint(
    body: RewriteTextRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Rewrite given English text at CEFR target_level using DeepSeek V3.2.
    Charges the user according to the selected model rate.

    Expects a JSON body: {"text": "...", "target_level": "B2", "enable_thinking": false, "include_mappings": true}.
    When include_mappings is true, also returns an array of {original, rewritten} mapping pairs.
    """
    # 确保计费配置已初始化
    try:
        ensure_default_billing_rates(db)
    except Exception as e:
        logger.exception("[DEBUG] llm.ensure_billing_rates_failed: %s", str(e)[:200])

    text = body.text.strip()
    target_level = body.target_level.strip()
    enable_thinking = body.enable_thinking
    include_mappings = body.include_mappings

    if target_level.upper() not in CEFR_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid target_level '{target_level}'. Must be one of: {', '.join(sorted(CEFR_LEVELS))}",
        )

    if not text:
        raise HTTPException(status_code=422, detail="text must be a non-empty string")

    if len(text) > REWRITE_MAX_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Text too long ({len(text)} chars). Maximum is {REWRITE_MAX_INPUT_CHARS} chars (~{REWRITE_MAX_INPUT_TOKENS} tokens).",
        )

    effective_model = LLM_MODEL_DEEPSEEK_THINKING if enable_thinking else LLM_MODEL_DEEPSEEK_FAST

    try:
        rate = get_model_rate(db, effective_model)
    except Exception as e:
        logger.exception("[DEBUG] llm.get_model_rate failed model=%s error=%s", effective_model, str(e)[:200])
        raise HTTPException(status_code=503, detail="LLM model not available")

    api_key = _require_api_key()
    if not api_key:
        logger.error("[DEBUG] llm.api_key_missing")
        raise HTTPException(status_code=503, detail="LLM API key not configured")

    trace_id = str(uuid.uuid4())

    system_prompt = (
        REWRITE_WITH_MAPPINGS_SYSTEM_PROMPT.format(target_level=target_level.upper())
        if include_mappings
        else REWRITE_SYSTEM_PROMPT.format(target_level=target_level.upper())
    )
    logger.info("[DEBUG] llm.rewrite_auth_check user_id=%s effective_model=%s enable_thinking=%s include_mappings=%s text_len=%d",
                 current_user.id, effective_model, enable_thinking, include_mappings, len(text))
    # #region agent log
    with open("D:/3.3-19.01/debug-f10f46.log", "a", encoding="utf-8") as _log:
        import json, datetime as _dt
        _log.write(json.dumps({
            "sessionId": "f10f46",
            "location": "llm.py:rewrite_text_endpoint:auth_ok",
            "message": "rewrite endpoint reached with auth OK",
            "data": {
                "user_id": current_user.id,
                "model": effective_model,
                "text_len": len(text),
                "trace_id": trace_id,
            },
            "timestamp": int(_dt.datetime.now().timestamp() * 1000),
            "runId": "run1",
            "hypothesisId": "D",
        }) + "\n")
    # #endregion
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text},
    ]

    try:
        raw_response, usage = call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=enable_thinking,
            stream=False,
            temperature=0.3,
            max_tokens=REWRITE_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        logger.exception("[DEBUG] llm.rewrite_failed user_id=%s error=%s", current_user.id, str(exc)[:200])
        raise HTTPException(status_code=502, detail=f"LLM call failed: {str(exc)[:200]}")

    if not raw_response:
        raise HTTPException(status_code=502, detail="LLM returned empty result")

    rewritten_text = raw_response
    rewrite_mappings: list[dict] = []

    if include_mappings:
        import json
        try:
            parsed = json.loads(raw_response)
            rewritten_text = parsed.get("rewritten_text", raw_response)
            rewrite_mappings = parsed.get("rewrite_mappings", [])
        except Exception as exc:
            logger.warning("[DEBUG] llm.rewrite_mappings_parse_failed user_id=%s raw=%s error=%s",
                           current_user.id, raw_response[:200], str(exc)[:100])
            rewrite_mappings = []

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
            note=f"重写文本，total_tokens={total_tokens}, enable_thinking={enable_thinking}",
        )
    except Exception:
        pass

    from app.services.llm_usage_service import log_llm_usage

    log_llm_usage(
        db,
        user_id=current_user.id,
        model_name=effective_model,
        category="rewrite",
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        total_tokens=total_tokens,
        input_cost_cents=None,
        charge_cents=charge_cents,
        lesson_id=None,
        enable_thinking=enable_thinking,
        input_text_preview=text[:200],
        trace_id=trace_id,
    )

    db.commit()

    return {
        "ok": True,
        "rewritten_text": rewritten_text,
        "rewrite_mappings": rewrite_mappings,
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
