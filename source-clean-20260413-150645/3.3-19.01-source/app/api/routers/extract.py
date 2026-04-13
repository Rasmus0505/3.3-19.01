"""
extract.py — Phase 39: 多模态内容提取 API

提供两个端点：
  POST /api/extract/url  — 服务端网页文章提取（使用 trafilatura + requests）
  POST /api/extract/ocr  — 服务端图片 OCR（DashScope 视觉 API）

URL 提取免费（轻量单次 HTTP 请求）。
OCR 消耗用户积分（调用外部 AI API）。
"""
from __future__ import annotations

import base64
import io
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/extract", tags=["extract"])

# OCR 单次固定积分消耗（与管理员可配置的计费体系解耦；后续可接入 rate 表）
OCR_FIXED_POINTS = 10
MAX_IMAGE_BYTES = 5 * 1024 * 1024   # 5MB
MIN_EXTRACTED_CHARS = 50


# ──────────────────────────────────────────────────────────────
# 请求 / 响应 Schema
# ──────────────────────────────────────────────────────────────

class ExtractUrlRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("url 必须以 http:// 或 https:// 开头")
        return v


class ExtractUrlResponse(BaseModel):
    ok: bool = True
    text: str
    title: str


class ExtractOcrResponse(BaseModel):
    ok: bool = True
    text: str
    confidence: float


# ──────────────────────────────────────────────────────────────
# URL 提取
# ──────────────────────────────────────────────────────────────

@router.post(
    "/url",
    response_model=ExtractUrlResponse,
    responses={
        400: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def extract_url_endpoint(
    body: ExtractUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    服务端网页文章提取。
    使用 trafilatura 提取正文文本，不消耗用户积分。
    """
    url = body.url
    try:
        import trafilatura
        import requests as req_lib

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        try:
            response = req_lib.get(url, headers=headers, timeout=15, allow_redirects=True)
            response.raise_for_status()
            html_content = response.text
        except req_lib.exceptions.ConnectionError:
            raise HTTPException(status_code=502, detail="无法访问该网页，请检查链接是否正确")
        except req_lib.exceptions.Timeout:
            raise HTTPException(status_code=502, detail="网页请求超时，请稍后重试")
        except req_lib.exceptions.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"网页请求失败：HTTP {e.response.status_code}")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"无法访问该网页：{str(e)[:100]}")

        extracted = trafilatura.extract(
            html_content,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )
        text = (extracted or "").strip()

        if len(text) < MIN_EXTRACTED_CHARS:
            raise HTTPException(
                status_code=400,
                detail="该网页内容过少，无法生成阅读包（可能是需要登录的页面或内容保护页）",
            )

        # 提取标题
        title = _extract_title_from_html(html_content) or url[:80]

        return ExtractUrlResponse(text=text, title=title)

    except HTTPException:
        raise
    except ImportError:
        logger.error("trafilatura not installed — cannot extract URL content")
        raise HTTPException(
            status_code=503,
            detail="网页提取服务暂时不可用（依赖未安装），请联系管理员",
        )
    except Exception as exc:
        logger.exception("extract_url unexpected error url=%s", url[:100])
        raise HTTPException(status_code=502, detail=f"提取失败：{str(exc)[:100]}")


def _extract_title_from_html(html: str) -> Optional[str]:
    """从 HTML 提取 <title> 或 <h1> 标签内容作为页面标题"""
    match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if match:
        title = match.group(1).strip()
        # 清理常见的站点名称后缀 (e.g. "Article Title - CNN")
        title = re.sub(r"\s*[-|–—]\s*[^-|–—]{2,}$", "", title).strip()
        return title or None
    return None


# ──────────────────────────────────────────────────────────────
# OCR
# ──────────────────────────────────────────────────────────────

@router.post(
    "/ocr",
    response_model=ExtractOcrResponse,
    responses={
        400: {"model": ErrorResponse},
        402: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def extract_ocr_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    图片 OCR 文本提取（DashScope 视觉 API）。
    消耗用户积分（OCR_FIXED_POINTS）。
    """
    # 文件大小检查
    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"文件过大，请选择小于 {MAX_IMAGE_BYTES // (1024 * 1024)}MB 的图片文件",
        )

    # MIME 类型检查
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/") and not _is_image_by_magic(content):
        raise HTTPException(status_code=400, detail="请上传有效的图片文件（JPEG、PNG、WEBP 等）")

    # 余额检查
    from app.services.billing import get_or_create_wallet_account, consume_points, BillingError
    account = get_or_create_wallet_account(db, current_user.id)
    if account.balance_points < OCR_FIXED_POINTS:
        raise HTTPException(
            status_code=402,
            detail=f"积分不足（需要 {OCR_FIXED_POINTS} 积分），请充值后再使用图片识别功能",
        )

    # 调用 DashScope 视觉 API
    try:
        import dashscope
        from app.core.config import DASHSCOPE_API_KEY
        if not DASHSCOPE_API_KEY:
            raise HTTPException(status_code=503, detail="OCR 服务未配置（DASHSCOPE_API_KEY 缺失）")

        # 将图片编码为 base64 data URL
        mime = content_type if content_type.startswith("image/") else "image/jpeg"
        b64 = base64.b64encode(content).decode("utf-8")
        image_data_url = f"data:{mime};base64,{b64}"

        response = dashscope.MultiModalConversation.call(
            api_key=DASHSCOPE_API_KEY,
            model="qwen-vl-plus",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"image": image_data_url},
                        {"text": "Please extract all English text from this image. Return only the extracted text, preserving paragraphs and line breaks. Do not add any explanation or commentary."},
                    ],
                }
            ],
        )

        if response.status_code != 200:
            logger.warning("DashScope OCR failed status=%s", response.status_code)
            raise HTTPException(status_code=503, detail="图片识别服务暂时不可用，请稍后重试")

        extracted_text = ""
        try:
            extracted_text = response.output.choices[0].message.content[0]["text"].strip()
        except (KeyError, IndexError, AttributeError) as e:
            logger.warning("DashScope OCR response parse error: %s", e)
            raise HTTPException(status_code=503, detail="图片识别返回格式异常，请稍后重试")

        if len(extracted_text) < 10:
            raise HTTPException(
                status_code=400,
                detail="图片识别未发现英文文字，请确保图片包含清晰的英文文本",
            )

        # 扣除积分
        try:
            consume_points(
                db,
                user_id=current_user.id,
                points=OCR_FIXED_POINTS,
                model_name="qwen-vl-plus",
                lesson_id=None,
                note=f"图片 OCR 识别，文件名={file.filename or '未知'}",
            )
            db.commit()
        except BillingError as e:
            db.rollback()
            raise HTTPException(status_code=402, detail=f"积分扣除失败：{e.message}")

        return ExtractOcrResponse(text=extracted_text, confidence=0.9)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("extract_ocr unexpected error user_id=%s", current_user.id)
        raise HTTPException(status_code=503, detail=f"图片识别失败：{str(exc)[:100]}")


def _is_image_by_magic(data: bytes) -> bool:
    """通过魔术字节检查是否为图片"""
    if len(data) < 4:
        return False
    # JPEG
    if data[:2] == b"\xff\xd8":
        return True
    # PNG
    if data[:4] == b"\x89PNG":
        return True
    # GIF
    if data[:3] == b"GIF":
        return True
    # WEBP
    if data[:4] == b"RIFF" and len(data) > 12 and data[8:12] == b"WEBP":
        return True
    # BMP
    if data[:2] == b"BM":
        return True
    return False
