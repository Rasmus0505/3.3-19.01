"""Course builder — orchestrates the two-stage generation pipeline.

Stage 1: Generate outline (LLM call)
Stage 2: Generate content for each scene (parallel or sequential)
"""

from __future__ import annotations

import logging
import threading
from typing import Callable

from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY
from app.models.course import Course, CourseScene
from app.services.course_service import (
    generate_course_outline,
    generate_scene_content,
    mark_course_ready,
    save_outline_to_course,
    update_scene_content,
)
from app.services.video_gen_service import generate_scene_video

logger = logging.getLogger(__name__)


def build_course_outline(
    db: Session,
    course: Course,
    material_text: str,
    api_key: str | None = None,
) -> Course:
    """Stage 1: Generate and save the course outline.

    After this step, the user can review/edit the outline before
    proceeding to Stage 2.
    """
    api_key = api_key or DASHSCOPE_API_KEY

    course.status = "outlining"
    db.flush()

    outline = generate_course_outline(
        material_text=material_text,
        target_level=course.cefr_level_target,
        original_level=course.cefr_level_original,
        api_key=api_key,
    )

    # Update course title from outline if present
    if outline.get("title"):
        course.title = outline["title"]

    course = save_outline_to_course(db, course, outline)
    return course


def build_course_content(
    db: Session,
    course: Course,
    material_text: str,
    progress_callback: Callable[[dict], None] | None = None,
    api_key: str | None = None,
) -> Course:
    """Stage 2: Generate content for each scene.

    Generates scenes sequentially (could be parallelized later).
    Calls progress_callback with status updates.
    """
    api_key = api_key or DASHSCOPE_API_KEY

    course.status = "generating"
    db.flush()

    scenes = list(course.scenes)
    total = len(scenes)

    for i, scene in enumerate(scenes):
        if progress_callback:
            progress_callback({
                "stage": "generating",
                "scene_idx": i,
                "scene_total": total,
                "scene_type": scene.scene_type,
                "scene_title": scene.title,
                "percent": int((i / total) * 100),
            })

        try:
            content = generate_scene_content(
                scene_type=scene.scene_type,
                scene_title=scene.title,
                scene_objective=(scene.content_json or {}).get("objective", ""),
                material_text=material_text,
                target_level=course.cefr_level_target,
                original_level=course.cefr_level_original,
                api_key=api_key,
            )

            models_used = ["deepseek-v3.2"]
            if scene.scene_type == "dictation":
                models_used.extend(["qwen3-asr", "qwen-mt", "qwen-tts"])
            elif scene.scene_type == "interactive":
                models_used.append("qwen-image")
            elif scene.scene_type == "discussion":
                # Try to generate a cover video for the discussion scene
                video_result = generate_scene_video(
                    scene_title=scene.title,
                    scene_objective=content.get("topic", scene.title),
                    target_level=course.cefr_level_target,
                    api_key=api_key,
                )
                if video_result:
                    content["cover_video_url"] = video_result.video_url
                    models_used.append("wanx2.1-t2v-turbo")

            update_scene_content(db, scene, content, models_used=models_used)

        except Exception as exc:
            logger.exception("course.scene_generation.failed course_id=%s scene_idx=%s type=%s", course.id, scene.idx, scene.scene_type)
            scene.status = "failed"
            scene.content_json = {"error": str(exc)[:500]}
            db.flush()

    course = mark_course_ready(db, course)

    if progress_callback:
        progress_callback({
            "stage": "completed",
            "scene_total": total,
            "percent": 100,
        })

    return course


def build_course_full(
    db: Session,
    course: Course,
    material_text: str,
    progress_callback: Callable[[dict], None] | None = None,
    api_key: str | None = None,
) -> Course:
    """Full pipeline: Stage 1 + Stage 2 in one call."""
    if progress_callback:
        progress_callback({"stage": "outlining", "percent": 0})

    course = build_course_outline(db, course, material_text, api_key=api_key)

    if progress_callback:
        progress_callback({"stage": "outlined", "percent": 20})

    course = build_course_content(db, course, material_text, progress_callback=progress_callback, api_key=api_key)
    return course
