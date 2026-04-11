"""Course generation orchestration service.

Two-stage pipeline:
  Stage 1: LLM analyzes material → generates course outline (list of Scenes)
  Stage 2: Each Scene content generated in parallel

I+1 principle (Krashen's Comprehensible Input Hypothesis) is injected into
every generation prompt to ensure content is adapted to the learner's level.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Generator

from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY
from app.core.timezone import now_shanghai_naive
from app.infra.llm.deepseek import call_deepseek
from app.models.course import Course, CourseScene

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# I+1 Prompt Snippets (injected into every generation prompt)
# ---------------------------------------------------------------------------

I1_PRINCIPLE_SNIPPET = """\
## I+1 Comprehensible Input Principle (Krashen)

You are generating content for a second-language learner. The learner's current
proficiency is at CEFR level **{target_level}**. Follow these rules strictly:

1. **Target level = learner level + 1** (the "i+1" zone). The content must be
   slightly above the learner's current level but still comprehensible.
2. **Vocabulary**: Use mostly words at or below the target level. Introduce a
   small number (1-3 per scene) of new words at exactly i+1.
3. **Grammar**: Use structures the learner has likely encountered, with at most
   one new pattern per scene.
4. **Context support**: Provide enough context clues (definitions, examples,
   translations) so the learner can infer the meaning of new items.
5. **Do NOT simplify excessively** — the learner must be pushed slightly beyond
   their comfort zone, not kept at the same level.

Original material CEFR level: **{original_level}**
Target (i+1) CEFR level: **{target_level}**\
"""

# ---------------------------------------------------------------------------
# Stage 1: Outline Generation
# ---------------------------------------------------------------------------

OUTLINE_SYSTEM_PROMPT = """\
You are an expert English course designer. Your task is to analyze the provided
learning material and create a structured course outline.

The course should transform the raw material into a series of learning "Scenes"
that follow the I+1 comprehensible input principle.

## Available Scene Types

1. **dictation** — Listening & typing practice (core skill). The learner listens
   to audio and types what they hear, word by word.
2. **quiz** — Comprehension quiz with multiple-choice or fill-in-the-blank
   questions to test understanding.
3. **interactive** — Interactive HTML activity (e.g., vocabulary matching,
   sentence reordering, grammar drag-and-drop).
4. **discussion** — Multi-agent discussion where an AI teacher and AI student
   discuss the topic; the learner can join in.

## Output Format

Return ONLY valid JSON:

{
  "title": "Course title based on the material",
  "scenes": [
    {
      "idx": 0,
      "type": "dictation",
      "title": "Scene title",
      "objective": "What the learner will practice/learn"
    },
    {
      "idx": 1,
      "type": "quiz",
      "title": "Comprehension Check",
      "objective": "Test understanding of key concepts"
    }
  ]
}

## Rules

- Generate 3-6 scenes total
- The first scene should usually be dictation (core skill)
- Mix scene types for variety
- Each scene must have a clear learning objective
- Order scenes from easier to harder
"""

OUTLINE_USER_PROMPT_TEMPLATE = """\
Source material (already transcribed/extracted):
---
{material_text}
---

Learner's current CEFR level: {target_level}
Original material CEFR level: {original_level}

Create a course outline with 3-6 scenes that transforms this material into an
I+1 learning experience. Remember: the content difficulty should be at the
learner's level + 1 (slightly challenging but comprehensible).\
"""


def generate_course_outline(
    material_text: str,
    target_level: str,
    original_level: str,
    api_key: str | None = None,
) -> dict:
    """Stage 1: Generate course outline from material.

    Returns the outline dict with title and scenes list.
    """
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY is required for course generation")

    i1_snippet = I1_PRINCIPLE_SNIPPET.format(
        target_level=target_level,
        original_level=original_level,
    )

    system_prompt = OUTLINE_SYSTEM_PROMPT + "\n\n" + i1_snippet
    user_prompt = OUTLINE_USER_PROMPT_TEMPLATE.format(
        material_text=material_text[:6000],  # Truncate to avoid token limit
        target_level=target_level,
        original_level=original_level,
    )

    content, _ = call_deepseek(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        api_key=api_key,
        enable_thinking=False,
        stream=False,
        temperature=0.7,
        max_tokens=2048,
    )

    # Parse JSON from LLM response
    outline = _extract_json(content)
    if not outline or "scenes" not in outline:
        raise ValueError(f"LLM did not return a valid course outline: {content[:200]}")

    return outline


# ---------------------------------------------------------------------------
# Stage 2: Scene Content Generation
# ---------------------------------------------------------------------------

def generate_scene_content(
    scene_type: str,
    scene_title: str,
    scene_objective: str,
    material_text: str,
    target_level: str,
    original_level: str,
    api_key: str | None = None,
) -> dict:
    """Stage 2: Generate content for a single scene.

    Returns the scene content dict (structure depends on scene type).
    """
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY is required")

    i1_snippet = I1_PRINCIPLE_SNIPPET.format(
        target_level=target_level,
        original_level=original_level,
    )

    generators = {
        "quiz": _generate_quiz_content,
        "interactive": _generate_interactive_content,
        "discussion": _generate_discussion_content,
        "dictation": _generate_dictation_content,
    }

    generator = generators.get(scene_type)
    if not generator:
        raise ValueError(f"Unknown scene type: {scene_type}")

    return generator(
        scene_title=scene_title,
        scene_objective=scene_objective,
        material_text=material_text,
        target_level=target_level,
        original_level=original_level,
        i1_snippet=i1_snippet,
        api_key=api_key,
    )


def _generate_quiz_content(
    scene_title: str,
    scene_objective: str,
    material_text: str,
    target_level: str,
    original_level: str,
    i1_snippet: str,
    api_key: str,
) -> dict:
    system_prompt = f"""\
{i1_snippet}

You are a quiz generator for English language learners. Generate a comprehension
quiz based on the provided material.

## Output Format

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "idx": 0,
      "type": "multiple_choice",
      "question": "Question text in English",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_index": 0,
      "explanation": "Brief explanation of why this answer is correct"
    }},
    {{
      "idx": 1,
      "type": "fill_blank",
      "question": "Fill in the blank: ...",
      "answer": "expected answer",
      "explanation": "Brief explanation"
    }}
  ]
}}

## Rules

- Generate 4-6 questions
- Mix multiple_choice and fill_blank types
- Questions should test comprehension, vocabulary, and grammar
- Use I+1 level vocabulary in questions
- Include a brief explanation for each answer
"""

    user_prompt = f"""\
Material:
---
{material_text[:4000]}
---

Scene: {scene_title}
Objective: {scene_objective}

Generate a quiz that tests the learner's understanding at CEFR {target_level} level.\
"""

    content, _ = call_deepseek(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        api_key=api_key,
        enable_thinking=False,
        stream=False,
        temperature=0.5,
        max_tokens=2048,
    )

    result = _extract_json(content)
    if not result or "questions" not in result:
        logger.warning("Quiz generation returned invalid JSON, using fallback")
        result = {"questions": []}
    return result


def _generate_interactive_content(
    scene_title: str,
    scene_objective: str,
    material_text: str,
    target_level: str,
    original_level: str,
    i1_snippet: str,
    api_key: str,
) -> dict:
    system_prompt = f"""\
{i1_snippet}

You are an interactive HTML activity generator for English language learners.
Generate a self-contained interactive HTML page that helps the learner practice
the target objective.

## Output Format

Return ONLY valid JSON:
{{
  "html": "<!DOCTYPE html><html>...(complete self-contained HTML)</html>",
  "activity_type": "vocabulary_match|sentence_reorder|grammar_drag|word_search",
  "instructions": "Brief instructions for the learner"
}}

## Rules

- Generate COMPLETE, self-contained HTML with inline CSS and JavaScript
- The HTML must work in a sandboxed iframe
- Use modern CSS (flexbox/grid, animations) for a polished look
- Include visual feedback (color changes, animations) for correct/incorrect actions
- All text must be in English (target language)
- Use I+1 level vocabulary
- The page should be responsive and fit in a 800x600 viewport
- Do NOT use external resources (CDN links, images, etc.)
- Use CSS variables for theming: --primary: #7c3aed, --secondary: #3b82f6
"""

    user_prompt = f"""\
Material:
---
{material_text[:4000]}
---

Scene: {scene_title}
Objective: {scene_objective}

Generate an interactive HTML activity at CEFR {target_level} level.\
"""

    content, _ = call_deepseek(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        api_key=api_key,
        enable_thinking=False,
        stream=False,
        temperature=0.7,
        max_tokens=4096,
    )

    result = _extract_json(content)
    if not result or "html" not in result:
        logger.warning("Interactive generation returned invalid JSON, using fallback")
        result = {"html": "<html><body><h2>Activity coming soon</h2></body></html>", "activity_type": "placeholder", "instructions": ""}
    return result


def _generate_discussion_content(
    scene_title: str,
    scene_objective: str,
    material_text: str,
    target_level: str,
    original_level: str,
    i1_snippet: str,
    api_key: str,
) -> dict:
    """Generate discussion topic and teacher/student prompts for the multi-agent discussion scene."""
    system_prompt = f"""\
{i1_snippet}

You are a discussion topic generator for an English learning multi-agent classroom.
Generate discussion content that will be used by an AI Teacher and AI Student.

## Output Format

Return ONLY valid JSON:
{{
  "topic": "Discussion topic title",
  "teacher_prompt": "Opening statement for the AI Teacher (1-2 sentences)",
  "student_prompt": "First question the AI Student will ask",
  "key_points": ["Point 1 to cover", "Point 2 to cover", "Point 3 to cover"],
  "vocabulary_focus": ["word1", "word2", "word3"]
}}

## Rules

- The topic should relate to the source material
- The teacher_prompt should introduce the topic at I+1 level
- The student_prompt should be a natural question a learner might ask
- key_points: 3-5 main points the discussion should cover
- vocabulary_focus: 3-5 key vocabulary words at the I+1 level
"""

    user_prompt = f"""\
Material:
---
{material_text[:4000]}
---

Scene: {scene_title}
Objective: {scene_objective}

Generate a discussion topic for CEFR {target_level} level learners.\
"""

    content, _ = call_deepseek(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        api_key=api_key,
        enable_thinking=False,
        stream=False,
        temperature=0.7,
        max_tokens=1024,
    )

    result = _extract_json(content)
    if not result or "topic" not in result:
        logger.warning("Discussion generation returned invalid JSON, using fallback")
        result = {"topic": scene_title, "teacher_prompt": "", "student_prompt": "", "key_points": [], "vocabulary_focus": []}
    return result


def _generate_dictation_content(
    scene_title: str,
    scene_objective: str,
    material_text: str,
    target_level: str,
    original_level: str,
    i1_snippet: str,
    api_key: str,
) -> dict:
    """For dictation scenes, we don't generate separate content — it reuses
    the existing Lesson (ASR → translate → sentence pipeline).
    Return a marker dict so the builder knows to create a Lesson instead."""
    return {
        "source_text": material_text[:6000],
        "target_level": target_level,
    }


# ---------------------------------------------------------------------------
# Course CRUD helpers
# ---------------------------------------------------------------------------

def create_course_record(
    db: Session,
    *,
    user_id: int,
    title: str,
    source_type: str,
    cefr_level_original: str,
    cefr_level_target: str,
    source_material_hash: str = "",
) -> Course:
    """Create a Course record in draft status."""
    course = Course(
        user_id=user_id,
        title=title,
        source_type=source_type,
        source_material_hash=source_material_hash,
        cefr_level_original=cefr_level_original,
        cefr_level_target=cefr_level_target,
        status="draft",
    )
    db.add(course)
    db.flush()
    return course


def save_outline_to_course(db: Session, course: Course, outline: dict) -> Course:
    """Save the generated outline and create CourseScene records."""
    course.outline_json = outline
    course.status = "outlining"

    # Create CourseScene records
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
    db.flush()
    return course


def update_scene_content(db: Session, scene: CourseScene, content: dict, models_used: list[str] | None = None) -> CourseScene:
    """Update a CourseScene with generated content."""
    scene.content_json = content
    scene.status = "ready"
    scene.models_used_json = models_used or []
    db.flush()
    return scene


def mark_course_ready(db: Session, course: Course) -> Course:
    """Mark all scenes as generated and course as ready."""
    all_ready = all(s.status == "ready" for s in course.scenes)
    if all_ready:
        course.status = "ready"
        # Collect all models used
        all_models = []
        for s in course.scenes:
            all_models.extend(s.models_used_json or [])
        course.models_used_json = sorted(set(all_models))
        db.flush()
    return course


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block
    if "```" in text:
        parts = text.split("```")
        for i, part in enumerate(parts):
            if i % 2 == 1:  # Inside code block
                cleaned = part.strip()
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:].strip()
                try:
                    return json.loads(cleaned)
                except json.JSONDecodeError:
                    continue

    # Try finding JSON object boundaries
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    return None
