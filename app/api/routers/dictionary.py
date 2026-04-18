from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.models import User
from app.schemas.dictionary import (
    DictionaryCollinsClassifyItem,
    DictionaryCollinsClassifyRequest,
    DictionaryCollinsClassifyResponse,
)
from app.services.collins_levels import normalize_collins_level
from app.services.dictionary_service import classify_tokens, dictionary_db_exists


router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


@router.post(
    "/collins-classify",
    response_model=DictionaryCollinsClassifyResponse,
)
def collins_classify(
    payload: DictionaryCollinsClassifyRequest,
    current_user: User = Depends(get_current_user),
):
    if not dictionary_db_exists():
        return error_response(503, "DICTIONARY_NOT_READY", "词典数据库未就绪，请先生成 vocabulary.sqlite")
    user_collins_level = normalize_collins_level(getattr(current_user, "collins_level", None), default=3) or 3
    items = classify_tokens(
        payload.tokens,
        user_collins_level=user_collins_level,
        include_entry=bool(payload.include_entry),
    )
    return DictionaryCollinsClassifyResponse(
        ok=True,
        user_collins_level=user_collins_level,
        items=[DictionaryCollinsClassifyItem.model_validate(item) for item in items],
    )
