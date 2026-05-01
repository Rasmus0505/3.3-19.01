"""Lesson Chat API — AI conversation partner for immersive listening practice."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_shared import _require_api_key
from app.db import get_db
from app.models import Lesson, User
from app.services.ai_platform import call_llm_chat as call_deepseek

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lesson-chat", tags=["lesson-chat"])


class ChatMessageItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class LessonChatRequest(BaseModel):
    lesson_id: int
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_history: list[ChatMessageItem] = Field(default_factory=list)


class LessonChatResponse(BaseModel):
    ok: bool
    reply: str
    usage: dict | None = None


def _build_lesson_context(db: Session, lesson_id: int) -> str:
    """Load lesson sentences as context for the AI conversation."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    sentences = sorted(lesson.sentences, key=lambda s: s.idx)[:20]
    if not sentences:
        return "No sentences available for this lesson."

    lines = []
    for s in sentences:
        line = f"[{s.idx + 1}] {s.text_en}"
        if s.text_zh:
            line += f" ({s.text_zh})"
        lines.append(line)
    return "\n".join(lines)


_SYSTEM_PROMPT = """\
You are an English speaking practice partner helping a student discuss listening material they are studying.

## Your role
- Help the student discuss and understand the listening content
- Encourage them to express ideas in English
- Respond at i+1 level (slightly above their current level)
- If they write in Chinese, you may mix Chinese and English in your response
- Keep responses short: 2-3 sentences, like a real conversation
- Be encouraging and natural

## Current lesson content
{lesson_context}

## Guidelines
- Reference specific sentences from the lesson when relevant
- Explain vocabulary or grammar if asked
- Ask follow-up questions to keep the conversation going
- Correct major errors gently by rephrasing (don't lecture)
"""


@router.post("/message", response_model=LessonChatResponse)
async def send_chat_message(
    body: LessonChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    api_key = _require_api_key()

    lesson_context = _build_lesson_context(db, body.lesson_id)

    system_message = _SYSTEM_PROMPT.format(lesson_context=lesson_context)

    messages = [{"role": "system", "content": system_message}]

    for msg in body.conversation_history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": body.message})

    try:
        reply, usage = call_deepseek(
            messages,
            api_key,
            enable_thinking=False,
            temperature=0.8,
            max_tokens=300,
        )
    except Exception as exc:
        logger.exception("lesson_chat LLM call failed user_id=%s lesson_id=%s", current_user.id, body.lesson_id)
        raise HTTPException(status_code=502, detail=f"AI response failed: {type(exc).__name__}")

    if not reply or not reply.strip():
        raise HTTPException(status_code=502, detail="AI returned empty response")

    return LessonChatResponse(
        ok=True,
        reply=reply.strip(),
        usage={
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
        },
    )
