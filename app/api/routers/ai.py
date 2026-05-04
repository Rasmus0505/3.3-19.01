from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.schemas import AiCatalogResponse, AiModelResponse, ErrorResponse
from app.services.ai_platform import (
    get_default_model_map,
    get_model_descriptor,
    list_capability_descriptors,
    list_model_descriptors,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get(
    "/catalog",
    response_model=AiCatalogResponse,
    responses={401: {"model": ErrorResponse}},
)
def get_ai_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    defaults = get_default_model_map(db=db)
    capabilities = [
        item.to_dict()
        for item in list_capability_descriptors(defaults)
    ]
    models = [item.to_dict() for item in list_model_descriptors()]
    return AiCatalogResponse(ok=True, capabilities=capabilities, models=models, default_models=defaults)


@router.get(
    "/catalog/models/{model_key}",
    response_model=AiModelResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def get_ai_model(
    model_key: str,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    descriptor = get_model_descriptor(model_key)
    if descriptor is None:
        return error_response(400, "INVALID_MODEL", "不支持的模型", model_key)
    return AiModelResponse(**descriptor.to_dict())
