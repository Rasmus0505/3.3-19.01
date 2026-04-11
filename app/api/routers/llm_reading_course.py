"""Reading classroom generation endpoint."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.llm_quiz import _validate_question
from app.api.routers.llm_shared import _require_api_key, recover_json_payload, strip_json_fences
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_TEXT_CHARS = 6000
MAX_KEYWORDS = 8


class ReadingCourseGenerateRequest(BaseModel):
    article_id: str = Field(..., min_length=1)
    article_title: str = ""
    original_text: str = Field(..., min_length=20)
    rewritten_text: str = Field(..., min_length=20)
    target_level: str = Field("B1", pattern="^(A1|A2|B1|B2|C1|C2)$")
    valid_i1_words: list[str] = Field(default_factory=list)
    valid_above_i1_words: list[str] = Field(default_factory=list)
    word_levels: dict[str, str] = Field(default_factory=dict)


class ReadingCourseGenerateResponse(BaseModel):
    ok: bool
    course: dict


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dedupe_words(words: list[str], limit: int = MAX_KEYWORDS) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for word in words:
        normalized = str(word or "").strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        result.append(normalized)
        if len(result) >= limit:
            break
    return result


def _split_sentences(text: str) -> list[str]:
    normalized = str(text or "").replace("\r", "\n").strip()
    if not normalized:
        return []
    parts = re.split(r"(?<=[.!?。！？])\s+|\n+", normalized)
    return [part.strip() for part in parts if part and part.strip()]


def _chunk_sentences(sentences: list[str], chunks: int = 3) -> list[list[str]]:
    if not sentences:
        return []
    chunk_count = max(1, min(chunks, len(sentences)))
    base, extra = divmod(len(sentences), chunk_count)
    groups: list[list[str]] = []
    index = 0
    for chunk_index in range(chunk_count):
        size = base + (1 if chunk_index < extra else 0)
        groups.append(sentences[index : index + size])
        index += size
    return groups


def _build_segment_payloads(original_text: str, rewritten_text: str) -> list[dict]:
    original_groups = _chunk_sentences(_split_sentences(original_text), 3)
    rewritten_groups = _chunk_sentences(_split_sentences(rewritten_text), 3)
    total = max(len(original_groups), len(rewritten_groups), 1)
    segments: list[dict] = []
    for index in range(total):
        rewritten_segment = " ".join(rewritten_groups[index]) if index < len(rewritten_groups) else ""
        original_segment = " ".join(original_groups[index]) if index < len(original_groups) else ""
        segments.append(
            {
                "id": f"segment-{index + 1}",
                "heading": f"Part {index + 1}",
                "rewritten_text": rewritten_segment,
                "original_text": original_segment,
                "focus": "Identify the main idea and one supporting detail.",
                "teacher_note": "Focus on the logic of this part before checking difficult wording.",
                "question": "What is the most important idea in this part?",
            }
        )
    return segments


def _build_fallback_quiz(segments: list[dict], keywords: list[str]) -> list[dict]:
    quiz: list[dict] = []
    if segments:
        quiz.append(
            {
                "type": "mcq",
                "question": "What should you focus on first when reading this article?",
                "options": [
                    "The main idea of each part",
                    "Every difficult word separately",
                    "Only the title",
                    "Only the last sentence",
                ],
                "answer": "The main idea of each part",
            }
        )
    if keywords:
        quiz.append(
            {
                "type": "fill",
                "sentence": f"One key word from this lesson is ___ .",
                "answer": keywords[0],
            }
        )
    if len(segments) >= 3:
        quiz.append(
            {
                "type": "order",
                "sentences": [segment["heading"] for segment in segments[:3]],
                "correct_order": [0, 1, 2],
            }
        )
    return quiz


def _build_fallback_course(body: ReadingCourseGenerateRequest) -> dict:
    keywords = _dedupe_words([*body.valid_above_i1_words, *body.valid_i1_words])
    segments = _build_segment_payloads(body.original_text, body.rewritten_text)
    explanation_points = [
        {
            "label": word,
            "explanation": f'This word may feel above {body.target_level}, so treat it as context-supported vocabulary.',
            "example": f'Try paraphrasing "{word}" in simpler English before returning to the original phrase.',
        }
        for word in keywords[:3]
    ]
    if not explanation_points:
        explanation_points = [
            {
                "label": "Structure",
                "explanation": "Track the claim, support, and conclusion in each part before checking details.",
                "example": "Ask yourself: what is the writer trying to prove here?",
            }
        ]

    title_seed = str(body.article_title or "").strip()
    if not title_seed:
        title_seed = "Reading Classroom"

    return {
        "schema_version": 1,
        "mode": "reading_classroom_v1",
        "article_id": body.article_id,
        "article_title": title_seed[:120],
        "target_level": body.target_level,
        "generated_at": _utc_iso(),
        "teacher": {
            "name": "Coach Mira",
            "persona": "A calm reading coach who keeps the lesson focused on meaning, structure, and usable English.",
            "tone": "clear and encouraging",
        },
        "source": {
            "primary_text": "rewritten",
            "word_counts": {
                "original": len(_split_sentences(body.original_text)),
                "rewritten": len(_split_sentences(body.rewritten_text)),
            },
        },
        "scenes": [
            {
                "id": "intro",
                "type": "intro",
                "title": "进入课堂",
                "goal": "建立阅读目标和课堂节奏。",
                "content": {
                    "hook": "This lesson turns one article into a guided reading classroom.",
                    "teacher_opening": "We will read for meaning first, then unpack vocabulary, structure, and your own response.",
                    "objectives": [
                        "Understand the article through i+1 text first",
                        "Return to the original wording for difficult points",
                        "Finish with a short output task",
                    ],
                },
            },
            {
                "id": "warmup",
                "type": "warmup",
                "title": "预热与关键词",
                "goal": "先建立本课的关注点和关键词。",
                "content": {
                    "preview": "Before reading closely, scan the key words and predict the article focus.",
                    "keywords": [
                        {
                            "word": word,
                            "reason": f"Important for understanding the text at {body.target_level} level.",
                            "tip": "Try to explain it with simpler English before reading the full article.",
                        }
                        for word in keywords
                    ],
                    "check_in": "Which word do you already know well, and which one do you want to watch for?",
                },
            },
            {
                "id": "close-reading",
                "type": "close_reading",
                "title": "分段精读",
                "goal": "按段推进主线理解，再回看原文细节。",
                "content": {
                    "segments": segments,
                },
            },
            {
                "id": "explanation",
                "type": "explanation",
                "title": "难点拆解",
                "goal": "把难词、表达和结构重新讲清楚。",
                "content": {
                    "points": explanation_points,
                },
            },
            {
                "id": "quiz",
                "type": "quiz",
                "title": "理解检查",
                "goal": "检查你是否抓住文章重点。",
                "content": {
                    "instructions": "Answer the questions before moving to the output task.",
                    "questions": _build_fallback_quiz(segments, keywords),
                },
            },
            {
                "id": "output",
                "type": "output",
                "title": "输出任务",
                "goal": "用自己的英语重新组织文章内容。",
                "content": {
                    "prompt": "Write 3-4 sentences to explain the main idea of the article and one detail that matters.",
                    "guidance": "Use at least one key word from the lesson and keep your language clear.",
                    "checklist": [
                        "State the main idea",
                        "Add one supporting detail",
                        "Use one lesson word or phrase",
                    ],
                },
            },
            {
                "id": "wrap-up",
                "type": "wrap_up",
                "title": "课堂收束",
                "goal": "回收重点并告诉你下一步怎么练。",
                "content": {
                    "takeaways": [
                        "Read the i+1 version for main meaning first",
                        "Use the original text to confirm difficult wording",
                        "Turn reading into output to make it stick",
                    ],
                    "teacher_closing": "You do not need to decode every word first. Build the meaning, then refine the language.",
                    "next_step": "Re-read one close-reading segment aloud and paraphrase it in your own words.",
                },
            },
        ],
    }


def _build_messages(body: ReadingCourseGenerateRequest, segments: list[dict], keywords: list[str]) -> list[dict]:
    system = """You are designing a reading-focused English classroom, not a generic course.
Return ONLY valid JSON with this exact top-level shape:
{
  "title": "string",
  "teacher": {"name": "string", "persona": "string", "tone": "string"},
  "intro": {"title": "string", "hook": "string", "teacher_opening": "string", "objectives": ["string"]},
  "warmup": {
    "title": "string",
    "preview": "string",
    "keywords": [{"word": "string", "reason": "string", "tip": "string"}],
    "check_in": "string"
  },
  "close_reading": {
    "title": "string",
    "segments": [{"heading": "string", "focus": "string", "teacher_note": "string", "question": "string"}]
  },
  "explanation": {
    "title": "string",
    "points": [{"label": "string", "explanation": "string", "example": "string"}]
  },
  "quiz": {
    "title": "string",
    "instructions": "string",
    "questions": []
  },
  "output": {
    "title": "string",
    "prompt": "string",
    "guidance": "string",
    "checklist": ["string"]
  },
  "wrap_up": {
    "title": "string",
    "takeaways": ["string"],
    "teacher_closing": "string",
    "next_step": "string"
  }
}

Rules:
- This is a reading-specific classroom for one article.
- Use rewritten text as the main teaching base, original text as support.
- Teacher is the clear lead voice. At most imply a student, but do not create multi-agent chaos.
- Keep the UI copy concise and practical.
- close_reading.segments must have the same count as the provided segments.
- explanation.points should focus on difficult vocabulary, phrasing, or logic.
- quiz.questions may include mcq, fill, and order questions only.
- Output must be compact, useful, and implementation-ready."""

    user_content = (
        f"Article title: {body.article_title or 'Reading Classroom'}\n"
        f"Target level: {body.target_level}\n"
        f"Priority keywords: {', '.join(keywords) if keywords else '(choose important words yourself)'}\n\n"
        f"Rewritten text:\n{body.rewritten_text[:MAX_TEXT_CHARS]}\n\n"
        f"Original text:\n{body.original_text[:MAX_TEXT_CHARS]}\n\n"
        "Prepared close-reading segments:\n"
        + json.dumps(
            [
                {
                    "id": segment["id"],
                    "rewritten_text": segment["rewritten_text"],
                    "original_text": segment["original_text"],
                }
                for segment in segments
            ],
            ensure_ascii=False,
        )
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


def _safe_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _safe_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _merge_course_payload(base_course: dict, ai_payload: dict | None) -> dict:
    if not isinstance(ai_payload, dict):
        return base_course

    next_course = json.loads(json.dumps(base_course))

    teacher = _safe_dict(ai_payload.get("teacher"))
    if teacher:
        next_course["teacher"] = {
            "name": str(teacher.get("name") or next_course["teacher"]["name"])[:60],
            "persona": str(teacher.get("persona") or next_course["teacher"]["persona"])[:240],
            "tone": str(teacher.get("tone") or next_course["teacher"]["tone"])[:80],
        }

    title = str(ai_payload.get("title") or "").strip()
    if title:
        next_course["article_title"] = title[:120]

    intro = _safe_dict(ai_payload.get("intro"))
    if intro:
        next_course["scenes"][0]["title"] = str(intro.get("title") or next_course["scenes"][0]["title"])
        next_course["scenes"][0]["content"]["hook"] = str(intro.get("hook") or next_course["scenes"][0]["content"]["hook"])
        next_course["scenes"][0]["content"]["teacher_opening"] = str(
            intro.get("teacher_opening") or next_course["scenes"][0]["content"]["teacher_opening"]
        )
        objectives = [str(item).strip() for item in _safe_list(intro.get("objectives")) if str(item).strip()]
        if objectives:
            next_course["scenes"][0]["content"]["objectives"] = objectives[:4]

    warmup = _safe_dict(ai_payload.get("warmup"))
    if warmup:
        next_course["scenes"][1]["title"] = str(warmup.get("title") or next_course["scenes"][1]["title"])
        next_course["scenes"][1]["content"]["preview"] = str(
            warmup.get("preview") or next_course["scenes"][1]["content"]["preview"]
        )
        next_course["scenes"][1]["content"]["check_in"] = str(
            warmup.get("check_in") or next_course["scenes"][1]["content"]["check_in"]
        )
        keywords = []
        for item in _safe_list(warmup.get("keywords")):
            if not isinstance(item, dict):
                continue
            word = str(item.get("word") or "").strip()
            if not word:
                continue
            keywords.append(
                {
                    "word": word[:40],
                    "reason": str(item.get("reason") or "").strip()[:160],
                    "tip": str(item.get("tip") or "").strip()[:160],
                }
            )
        if keywords:
            next_course["scenes"][1]["content"]["keywords"] = keywords[:MAX_KEYWORDS]

    close_reading = _safe_dict(ai_payload.get("close_reading"))
    close_reading_segments = _safe_list(close_reading.get("segments"))
    if close_reading:
        next_course["scenes"][2]["title"] = str(
            close_reading.get("title") or next_course["scenes"][2]["title"]
        )
    if close_reading_segments:
        for index, segment in enumerate(next_course["scenes"][2]["content"]["segments"]):
            if index >= len(close_reading_segments):
                break
            item = _safe_dict(close_reading_segments[index])
            segment["heading"] = str(item.get("heading") or segment["heading"])[:80]
            segment["focus"] = str(item.get("focus") or segment["focus"])[:220]
            segment["teacher_note"] = str(item.get("teacher_note") or segment["teacher_note"])[:320]
            segment["question"] = str(item.get("question") or segment["question"])[:220]

    explanation = _safe_dict(ai_payload.get("explanation"))
    if explanation:
        next_course["scenes"][3]["title"] = str(
            explanation.get("title") or next_course["scenes"][3]["title"]
        )
        points = []
        for item in _safe_list(explanation.get("points")):
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            explanation_text = str(item.get("explanation") or "").strip()
            if not label or not explanation_text:
                continue
            points.append(
                {
                    "label": label[:80],
                    "explanation": explanation_text[:320],
                    "example": str(item.get("example") or "").strip()[:220],
                }
            )
        if points:
            next_course["scenes"][3]["content"]["points"] = points[:5]

    quiz = _safe_dict(ai_payload.get("quiz"))
    if quiz:
        next_course["scenes"][4]["title"] = str(quiz.get("title") or next_course["scenes"][4]["title"])
        next_course["scenes"][4]["content"]["instructions"] = str(
            quiz.get("instructions") or next_course["scenes"][4]["content"]["instructions"]
        )
        questions = [
            question
            for question in _safe_list(quiz.get("questions"))
            if isinstance(question, dict) and _validate_question(question)
        ]
        if questions:
            next_course["scenes"][4]["content"]["questions"] = questions[:6]

    output = _safe_dict(ai_payload.get("output"))
    if output:
        next_course["scenes"][5]["title"] = str(output.get("title") or next_course["scenes"][5]["title"])
        next_course["scenes"][5]["content"]["prompt"] = str(
            output.get("prompt") or next_course["scenes"][5]["content"]["prompt"]
        )
        next_course["scenes"][5]["content"]["guidance"] = str(
            output.get("guidance") or next_course["scenes"][5]["content"]["guidance"]
        )
        checklist = [str(item).strip() for item in _safe_list(output.get("checklist")) if str(item).strip()]
        if checklist:
            next_course["scenes"][5]["content"]["checklist"] = checklist[:4]

    wrap_up = _safe_dict(ai_payload.get("wrap_up"))
    if wrap_up:
        next_course["scenes"][6]["title"] = str(wrap_up.get("title") or next_course["scenes"][6]["title"])
        takeaways = [str(item).strip() for item in _safe_list(wrap_up.get("takeaways")) if str(item).strip()]
        if takeaways:
            next_course["scenes"][6]["content"]["takeaways"] = takeaways[:4]
        next_course["scenes"][6]["content"]["teacher_closing"] = str(
            wrap_up.get("teacher_closing") or next_course["scenes"][6]["content"]["teacher_closing"]
        )
        next_course["scenes"][6]["content"]["next_step"] = str(
            wrap_up.get("next_step") or next_course["scenes"][6]["content"]["next_step"]
        )

    return next_course


@router.post(
    "/reading-course/generate",
    response_model=ReadingCourseGenerateResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_reading_course_endpoint(
    body: ReadingCourseGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)

    keywords = _dedupe_words([*body.valid_above_i1_words, *body.valid_i1_words])
    fallback_course = _build_fallback_course(body)
    messages = _build_messages(body, fallback_course["scenes"][2]["content"]["segments"], keywords)

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.55,
            max_tokens=4096,
        )
    except Exception as exc:
        logger.warning("Reading course generation LLM call failed, returning fallback: %s", exc)
        return ReadingCourseGenerateResponse(ok=True, course=fallback_course)

    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    parsed_payload: dict | None = None
    try:
        parsed = json.loads(recovered)
        if isinstance(parsed, dict):
            parsed_payload = parsed
    except Exception:
        logger.warning("Reading course JSON parse failed. Raw: %.300s", raw_response)

    course = _merge_course_payload(fallback_course, parsed_payload)

    try:
        rate = llm_root.get_model_rate(db, llm_root.LLM_MODEL_DEEPSEEK_FAST)
        if rate:
            total_tokens = usage.prompt_tokens + usage.completion_tokens
            charge = llm_root.calculate_llm_charge_by_tokens(
                total_tokens=total_tokens,
                points_per_1k_tokens=rate.points_per_1k_tokens,
            )
            if charge > 0:
                llm_root.consume_points(
                    db,
                    user_id=current_user.id,
                    points=charge,
                    model_name=llm_root.LLM_MODEL_DEEPSEEK_FAST,
                    lesson_id=None,
                    event_type=llm_root.EVENT_CONSUME_LLM,
                    note=f"reading course generation, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("Reading course billing failed silently for user %s", current_user.id)

    return ReadingCourseGenerateResponse(ok=True, course=course)
