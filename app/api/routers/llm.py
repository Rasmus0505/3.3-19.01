"""Composed LLM API router with capability-specific submodules."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routers.llm_discussion import router as discussion_router
from app.api.routers.llm_quiz import router as quiz_router
from app.api.routers.llm_reading import generate_reading_material_endpoint
from app.api.routers.llm_reading import router as reading_router
from app.api.routers.llm_reading_course import router as reading_course_router
from app.api.routers.llm_sentence import (
    SentenceExplanationRequest,
    SentenceExplanationResponse,
    explain_sentence,
)
from app.api.routers.llm_sentence import (
    router as sentence_router,
)
from app.api.routers.llm_shared import (
    COMMON_SIMPLIFY_WORD_MEANINGS,
    LLM_MODEL_DEEPSEEK_FAST,
    LLM_MODEL_DEEPSEEK_THINKING,
    LLM_VALID_MODELS,
    _require_api_key,
)
from app.api.routers.llm_usage import (
    estimate_tokens_endpoint,
    list_llm_models_endpoint,
    list_llm_usage_endpoint,
)
from app.api.routers.llm_usage import (
    router as usage_router,
)
from app.api.routers.llm_vocabulary import (
    ExtractLemmasRequest,
    FilterAndSimplifyRequest,
    SimplifyWordsRequest,
    _do_filter_and_simplify,
    extract_lemmas_endpoint,
    filter_and_simplify_words_endpoint,
    simplify_words_endpoint,
)
from app.api.routers.llm_vocabulary import (
    router as vocabulary_router,
)
from app.api.routers.llm_writing import router as writing_router
from app.infra.llm.deepseek import generate_reading_material
from app.services.ai_platform import call_llm_chat as call_deepseek
from app.services.billing_service import (
    EVENT_CONSUME_LLM,
    calculate_llm_charge_by_tokens,
    consume_points,
    ensure_default_billing_rates,
    get_model_rate,
)
from app.services.collins_levels import VALID_COLLINS_LEVELS

router = APIRouter(prefix="/api/llm", tags=["llm"])
router.include_router(reading_router)
router.include_router(usage_router)
router.include_router(vocabulary_router)
router.include_router(sentence_router)
router.include_router(quiz_router)
router.include_router(discussion_router)
router.include_router(reading_course_router)
router.include_router(writing_router)

__all__ = [
    "COMMON_SIMPLIFY_WORD_MEANINGS",
    "EVENT_CONSUME_LLM",
    "ExtractLemmasRequest",
    "FilterAndSimplifyRequest",
    "LLM_MODEL_DEEPSEEK_FAST",
    "LLM_MODEL_DEEPSEEK_THINKING",
    "LLM_VALID_MODELS",
    "SentenceExplanationRequest",
    "SentenceExplanationResponse",
    "SimplifyWordsRequest",
    "_do_filter_and_simplify",
    "_require_api_key",
    "calculate_llm_charge_by_tokens",
    "call_deepseek",
    "consume_points",
    "ensure_default_billing_rates",
    "estimate_tokens_endpoint",
    "explain_sentence",
    "extract_lemmas_endpoint",
    "filter_and_simplify_words_endpoint",
    "generate_reading_material",
    "generate_reading_material_endpoint",
    "get_model_rate",
    "list_llm_models_endpoint",
    "list_llm_usage_endpoint",
    "router",
    "simplify_words_endpoint",
    "VALID_COLLINS_LEVELS",
]
