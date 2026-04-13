"""Video generation infrastructure using DashScope video models.

Supports generating short teaching videos from text prompts.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
DASHSCOPE_VIDEO_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/generation"


@dataclass(frozen=True)
class VideoGenerationResult:
    video_url: str
    task_id: str
    duration_seconds: float


def generate_video_from_prompt(
    prompt: str,
    *,
    api_key: str | None = None,
    model: str = "wanx2.1-t2v-turbo",
    resolution: str = "720P",
    duration: int = 5,
    timeout_seconds: int = 300,
) -> VideoGenerationResult:
    """Generate a short video from a text prompt using DashScope.

    This is an async operation — we submit the task and poll for completion.
    """
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY is required for video generation")

    start_time = time.time()

    # Submit generation task
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "input": {
            "prompt": prompt,
        },
        "parameters": {
            "resolution": resolution,
            "duration": duration,
        },
    }

    response = requests.post(
        DASHSCOPE_VIDEO_BASE_URL,
        headers=headers,
        json=payload,
        timeout=30,
    )

    if response.status_code != 200:
        raise RuntimeError(f"Video generation submission failed: {response.status_code} {response.text[:500]}")

    result = response.json()
    task_id = result.get("output", {}).get("task_id", "")

    if not task_id:
        raise RuntimeError(f"No task_id in video generation response: {result}")

    logger.info("video.submitted task_id=%s model=%s", task_id, model)

    # Poll for completion
    poll_url = f"{DASHSCOPE_VIDEO_BASE_URL}/result?task_id={task_id}"
    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout_seconds:
            raise TimeoutError(f"Video generation timed out after {timeout_seconds}s")

        poll_response = requests.get(
            poll_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )

        if poll_response.status_code != 200:
            raise RuntimeError(f"Video poll failed: {poll_response.status_code}")

        poll_data = poll_response.json()
        task_status = poll_data.get("output", {}).get("task_status", "")

        if task_status == "SUCCEEDED":
            video_url = poll_data.get("output", {}).get("video_url", "")
            if not video_url:
                # Try results array format
                results = poll_data.get("output", {}).get("results", [])
                if results:
                    video_url = results[0].get("url", "")

            if not video_url:
                raise RuntimeError("Video generation succeeded but no video URL returned")

            return VideoGenerationResult(
                video_url=video_url,
                task_id=task_id,
                duration_seconds=elapsed,
            )

        elif task_status == "FAILED":
            error_msg = poll_data.get("output", {}).get("message", "Unknown error")
            raise RuntimeError(f"Video generation failed: {error_msg}")

        # Still processing — wait and retry
        time.sleep(5)

    raise RuntimeError("Video generation loop exited unexpectedly")
