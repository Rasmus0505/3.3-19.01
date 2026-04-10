from __future__ import annotations

from fastapi import APIRouter

from .billing import router as billing_router
from .redeem import router as redeem_router
from .security import router as security_router
from .subtitle_settings import router as subtitle_settings_router
from .users import router as users_router


router = APIRouter()
router.include_router(users_router)
router.include_router(security_router)
router.include_router(billing_router)
router.include_router(subtitle_settings_router)
router.include_router(redeem_router)
