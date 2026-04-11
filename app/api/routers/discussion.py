"""Discussion API routes — SSE streaming multi-agent discussion."""

from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.db import get_db
from app.models.course import Course, CourseScene
from app.models.user import User
from app.services.discussion_service import (
    DiscussionMessage,
    DiscussionState,
    advance_discussion,
    generate_discussion_summary,
    start_discussion,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discussion", tags=["discussion"])

# In-memory discussion state store (session-scoped)
# Key: discussion_id, Value: DiscussionState
_discussion_store: dict[str, DiscussionState] = {}


class DiscussionStartRequest(BaseModel):
    course_id: int
    scene_id: int
    topic: str = Field(..., min_length=1)
    target_level: str = Field("B1")
    key_points: list[str] = Field(default_factory=list)
    vocabulary_focus: list[str] = Field(default_factory=list)
    teacher_prompt: str = ""


class DiscussionReplyRequest(BaseModel):
    discussion_id: str
    message: str = Field(..., min_length=1)


class DiscussionEndRequest(BaseModel):
    discussion_id: str


def _format_sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _message_to_dict(msg: DiscussionMessage) -> dict:
    return {
        "role": msg.role,
        "content": msg.content,
        "timestamp": msg.timestamp or time.time(),
    }


@router.post("/start")
def start_discussion_endpoint(
    payload: DiscussionStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a new discussion. Returns the teacher's opening message via SSE stream."""
    # Verify course/scene ownership
    scene = db.get(CourseScene, payload.scene_id)
    if not scene or scene.course_id != payload.course_id:
        return error_response(404, "SCENE_NOT_FOUND", "Scene not found")

    course = db.get(Course, payload.course_id)
    if not course or course.user_id != current_user.id:
        return error_response(404, "COURSE_NOT_FOUND", "Course not found")

    def _stream():
        try:
            state = start_discussion(
                topic=payload.topic,
                target_level=payload.target_level,
                key_points=payload.key_points,
                vocabulary_focus=payload.vocabulary_focus,
                teacher_prompt=payload.teacher_prompt,
            )

            discussion_id = str(uuid.uuid4())
            _discussion_store[discussion_id] = state

            # Send discussion ID
            yield _format_sse_event("discussion_start", {
                "discussion_id": discussion_id,
                "topic": payload.topic,
                "target_level": payload.target_level,
            })

            # Send teacher's opening message
            for msg in state.messages:
                yield _format_sse_event("message", _message_to_dict(msg))

            yield _format_sse_event("turn", {"current_turn": "student"})

        except Exception as exc:
            logger.exception("discussion.start.failed")
            yield _format_sse_event("error", {"code": "START_FAILED", "message": str(exc)[:500]})

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/reply")
def reply_discussion(
    payload: DiscussionReplyRequest,
    current_user: User = Depends(get_current_user),
):
    """User sends a message. AI student and teacher respond in turn via SSE stream."""
    state = _discussion_store.get(payload.discussion_id)
    if not state:
        return error_response(404, "DISCUSSION_NOT_FOUND", "Discussion session not found")

    if state.turn_count >= state.max_turns:
        return error_response(400, "DISCUSSION_ENDED", "Maximum discussion turns reached")

    def _stream():
        try:
            # Add user message and generate AI responses
            for msg in advance_discussion(state, user_message=payload.message):
                yield _format_sse_event("message", _message_to_dict(msg))

            # After student + teacher exchange, check if we should continue
            if state.turn_count >= state.max_turns:
                summary = generate_discussion_summary(state)
                yield _format_sse_event("summary", {"content": summary})
                yield _format_sse_event("discussion_end", {"reason": "max_turns_reached"})
            else:
                yield _format_sse_event("turn", {"current_turn": state.current_turn})

        except Exception as exc:
            logger.exception("discussion.reply.failed")
            yield _format_sse_event("error", {"code": "REPLY_FAILED", "message": str(exc)[:500]})

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/skip")
def skip_user_turn(
    payload: DiscussionReplyRequest,
    current_user: User = Depends(get_current_user),
):
    """User skips their turn. AI agents continue without user input."""
    state = _discussion_store.get(payload.discussion_id)
    if not state:
        return error_response(404, "DISCUSSION_NOT_FOUND", "Discussion session not found")

    def _stream():
        try:
            # Generate AI responses without user message
            for msg in advance_discussion(state, user_message=None):
                yield _format_sse_event("message", _message_to_dict(msg))

            if state.turn_count >= state.max_turns:
                summary = generate_discussion_summary(state)
                yield _format_sse_event("summary", {"content": summary})
                yield _format_sse_event("discussion_end", {"reason": "max_turns_reached"})
            else:
                yield _format_sse_event("turn", {"current_turn": state.current_turn})

        except Exception as exc:
            logger.exception("discussion.skip.failed")
            yield _format_sse_event("error", {"code": "SKIP_FAILED", "message": str(exc)[:500]})

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/end")
def end_discussion(
    payload: DiscussionEndRequest,
    current_user: User = Depends(get_current_user),
):
    """End the discussion and get a summary."""
    state = _discussion_store.get(payload.discussion_id)
    if not state:
        return error_response(404, "DISCUSSION_NOT_FOUND", "Discussion session not found")

    try:
        summary = generate_discussion_summary(state)
        # Clean up
        _discussion_store.pop(payload.discussion_id, None)
        return {"ok": True, "summary": summary}
    except Exception as exc:
        return error_response(500, "SUMMARY_FAILED", "Failed to generate summary", str(exc)[:500])
