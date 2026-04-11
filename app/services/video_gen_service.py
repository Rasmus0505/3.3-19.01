"""Video generation service — high-level API for course scene video generation."""

from __future__ import annotations

import logging

from app.core.config import DASHSCOPE_API_KEY
from app.infra.video_generation import VideoGenerationResult, generate_video_from_prompt

logger = logging.getLogger(__name__)


def generate_scene_video(
    scene_title: str,
    scene_objective: str,
    target_level: str = "B1",
    api_key: str | None = None,
) -> VideoGenerationResult | None:
    """Generate a short teaching video for a course scene.

    Returns None if video generation is not available or fails gracefully.
    """
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        logger.warning("video.skip no DASHSCOPE_API_KEY")
        return None

    prompt = (
        f"Educational animation for English language learning at CEFR {target_level} level. "
        f"Topic: {scene_title}. Objective: {scene_objective}. "
        f"Style: clean, modern, with text overlays for key vocabulary. "
        f"Duration: 5 seconds."
    )

    try:
        result = generate_video_from_prompt(
            prompt=prompt,
            api_key=api_key,
            duration=5,
            timeout_seconds=120,
        )
        logger.info("video.generated scene=%s url=%s", scene_title, result.video_url[:80])
        return result
    except Exception as exc:
        logger.warning("video.generation_failed scene=%s error=%s", scene_title, str(exc)[:200])
        return None
