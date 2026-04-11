"""Course API routes — create, outline, generate, list, and get courses."""

from __future__ import annotations

import json
import logging
import queue
import threading

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.config import DASHSCOPE_API_KEY
from app.core.errors import error_response
from app.db import SessionLocal, get_db
from app.models.course import Course, CourseScene
from app.models.user import User
from app.services.course_builder import build_course_content, build_course_full, build_course_outline
from app.services.course_service import create_course_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/courses", tags=["courses"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CourseCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    source_type: str = Field("text", pattern="^(upload|url|text|ocr)$")
    material_text: str = Field(..., min_length=1)
    cefr_level_original: str = Field("B2", pattern="^(A1|A2|B1|B2|C1|C2)$")
    cefr_level_target: str = Field("B1", pattern="^(A1|A2|B1|B2|C1|C2)$")


class CourseOutlineUpdateRequest(BaseModel):
    outline: dict


class CourseSceneContentResponse(BaseModel):
    id: int
    idx: int
    scene_type: str
    title: str
    status: str
    content: dict | None = None
    models_used: list[str] = []


class CourseResponse(BaseModel):
    id: int
    title: str
    source_type: str
    cefr_level_original: str
    cefr_level_target: str
    status: str
    scene_count: int
    models_used: list[str] = []
    scenes: list[CourseSceneContentResponse] = []
    created_at: str = ""
    updated_at: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_course_response(course: Course, include_content: bool = False) -> CourseResponse:
    scenes = []
    for s in course.scenes:
        scene_resp = CourseSceneContentResponse(
            id=s.id,
            idx=s.idx,
            scene_type=s.scene_type,
            title=s.title,
            status=s.status,
            content=s.content_json if include_content else None,
            models_used=s.models_used_json or [],
        )
        scenes.append(scene_resp)

    return CourseResponse(
        id=course.id,
        title=course.title,
        source_type=course.source_type,
        cefr_level_original=course.cefr_level_original,
        cefr_level_target=course.cefr_level_target,
        status=course.status,
        scene_count=course.scene_count,
        models_used=course.models_used_json or [],
        scenes=scenes,
        created_at=str(course.created_at) if course.created_at else "",
        updated_at=str(course.updated_at) if course.updated_at else "",
    )


def _format_sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _require_course_owner(db: Session, course_id: int, user_id: int) -> Course:
    course = db.get(Course, course_id)
    if not course or course.user_id != user_id:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=CourseResponse)
def create_course(
    payload: CourseCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new course (draft). Does NOT start generation yet."""
    course = create_course_record(
        db,
        user_id=current_user.id,
        title=payload.title,
        source_type=payload.source_type,
        cefr_level_original=payload.cefr_level_original,
        cefr_level_target=payload.cefr_level_target,
    )
    db.commit()
    return _to_course_response(course)


@router.post("/{course_id}/generate", response_model=CourseResponse)
def generate_course_full(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full pipeline: generate outline + content for all scenes (synchronous)."""
    course = _require_course_owner(db, course_id, current_user.id)

    if course.status not in ("draft", "failed"):
        return error_response(400, "INVALID_STATUS", "Course is not in a generatable state")

    # Get material from first scene's content or from outline
    material_text = ""
    if course.outline_json:
        material_text = json.dumps(course.outline_json)
    else:
        # Use a placeholder — in real use, material comes from upload/text
        material_text = f"Course: {course.title}"

    try:
        course = build_course_full(db, course, material_text)
        db.commit()
    except Exception as exc:
        db.rollback()
        course.status = "failed"
        db.commit()
        return error_response(500, "GENERATION_FAILED", "Course generation failed", str(exc)[:500])

    return _to_course_response(course, include_content=True)


@router.post("/{course_id}/generate/stream")
def generate_course_stream(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full pipeline with SSE progress streaming."""
    course = _require_course_owner(db, course_id, current_user.id)

    if course.status not in ("draft", "failed"):
        return error_response(400, "INVALID_STATUS", "Course is not in a generatable state")

    material_text = ""
    if course.outline_json:
        material_text = json.dumps(course.outline_json)
    else:
        material_text = f"Course: {course.title}"

    bind = db.get_bind()
    event_queue: queue.Queue[tuple[str, dict] | None] = queue.Queue()

    def _worker():
        worker_db = Session(bind=bind, future=True)
        try:
            worker_course = worker_db.get(Course, course_id)
            if not worker_course:
                event_queue.put(("error", {"code": "NOT_FOUND", "message": "Course not found"}))
                return

            def _progress(payload: dict) -> None:
                event_queue.put(("progress", payload))

            result = build_course_full(worker_db, worker_course, material_text, progress_callback=_progress)
            worker_db.commit()
            event_queue.put(("completed", {"course_id": result.id, "status": result.status}))
        except Exception as exc:
            worker_db.rollback()
            event_queue.put(("error", {"code": "GENERATION_FAILED", "message": str(exc)[:500]}))
        finally:
            worker_db.close()
            event_queue.put(None)

    def _stream():
        while True:
            item = event_queue.get()
            if item is None:
                break
            event_name, event_payload = item
            yield _format_sse_event(event_name, event_payload)

    threading.Thread(target=_worker, daemon=True).start()
    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{course_id}/outline", response_model=CourseResponse)
def generate_outline(
    course_id: int,
    payload: CourseCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 1 only: generate outline. User can review before proceeding to Stage 2."""
    course = _require_course_owner(db, course_id, current_user.id)

    if course.status not in ("draft", "failed"):
        return error_response(400, "INVALID_STATUS", "Course outline can only be generated for draft courses")

    try:
        course = build_course_outline(db, course, payload.material_text)
        db.commit()
    except Exception as exc:
        db.rollback()
        return error_response(500, "OUTLINE_FAILED", "Outline generation failed", str(exc)[:500])

    return _to_course_response(course)


@router.patch("/{course_id}/outline", response_model=CourseResponse)
def update_outline(
    course_id: int,
    payload: CourseOutlineUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the outline (user edits before generating content)."""
    course = _require_course_owner(db, course_id, current_user.id)

    if course.status not in ("outlining",):
        return error_response(400, "INVALID_STATUS", "Can only edit outline when course is in outlining state")

    # Delete existing scenes and recreate
    for scene in course.scenes:
        db.delete(scene)
    db.flush()

    outline = payload.outline
    course.outline_json = outline

    for scene_data in outline.get("scenes", []):
        scene = CourseScene(
            course_id=course.id,
            idx=scene_data.get("idx", 0),
            scene_type=scene_data.get("type", "dictation"),
            title=scene_data.get("title", ""),
            status="pending",
        )
        db.add(scene)

    course.scene_count = len(outline.get("scenes", []))
    db.commit()

    # Refresh
    db.refresh(course)
    return _to_course_response(course)


@router.post("/{course_id}/scenes/generate", response_model=CourseResponse)
def generate_scenes(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 2: generate content for all pending scenes."""
    course = _require_course_owner(db, course_id, current_user.id)

    if course.status not in ("outlining", "failed"):
        return error_response(400, "INVALID_STATUS", "Scene generation requires outline first")

    material_text = json.dumps(course.outline_json) if course.outline_json else ""

    try:
        course = build_course_content(db, course, material_text)
        db.commit()
    except Exception as exc:
        db.rollback()
        return error_response(500, "SCENE_GENERATION_FAILED", "Scene generation failed", str(exc)[:500])

    return _to_course_response(course, include_content=True)


@router.get("", response_model=list[CourseResponse])
def list_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all courses for the current user."""
    courses = db.query(Course).filter(Course.user_id == current_user.id).order_by(Course.created_at.desc()).all()
    return [_to_course_response(c) for c in courses]


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get course details including all scenes."""
    course = _require_course_owner(db, course_id, current_user.id)
    return _to_course_response(course, include_content=True)


@router.delete("/{course_id}")
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a course and all its scenes."""
    course = _require_course_owner(db, course_id, current_user.id)
    db.delete(course)
    db.commit()
    return {"ok": True, "course_id": course_id}
