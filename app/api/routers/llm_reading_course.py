"""Reading classroom generation and live discussion endpoints."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

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
    target_level: int = Field(3, ge=1, le=5)
    valid_i1_words: list[str] = Field(default_factory=list)
    valid_above_i1_words: list[str] = Field(default_factory=list)
    word_levels: dict[str, str] = Field(default_factory=dict)


class ReadingCourseGenerateResponse(BaseModel):
    ok: bool
    course: dict


class DiscussionHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class ReadingCourseDiscussionRequest(BaseModel):
    course: dict[str, Any]
    scene_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[DiscussionHistoryItem] = Field(default_factory=list)


class ReadingCourseDiscussionResponse(BaseModel):
    ok: bool
    reply: str
    usage: dict | None = None


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _safe_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _trim(value: object, limit: int) -> str:
    return str(value or "").strip()[:limit]


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


def _build_segments(original_text: str, rewritten_text: str) -> list[dict]:
    original_groups = _chunk_sentences(_split_sentences(original_text), 3)
    rewritten_groups = _chunk_sentences(_split_sentences(rewritten_text), 3)
    total = max(len(original_groups), len(rewritten_groups), 1)
    return [
        {
            "id": f"segment-{index + 1}",
            "heading": f"Part {index + 1}",
            "rewritten_text": " ".join(rewritten_groups[index]) if index < len(rewritten_groups) else "",
            "original_text": " ".join(original_groups[index]) if index < len(original_groups) else "",
            "focus": "Identify the main idea and one supporting detail.",
            "teacher_note": "Stay with the logic first, then return to the difficult wording.",
            "question": "What is the key message of this part?",
        }
        for index in range(total)
    ]


def _build_fallback_course(body: ReadingCourseGenerateRequest) -> dict:
    keywords = _dedupe_words([*body.valid_above_i1_words, *body.valid_i1_words])
    segments = _build_segments(body.original_text, body.rewritten_text)
    title_seed = str(body.article_title or "").strip() or "Reading Classroom"
    scenes = [
        {
            "id": "entry",
            "type": "entry",
            "title": "进入课堂",
            "goal": "先知道这节阅读课要怎么推进。",
            "beats": [
                {"id": "entry-1", "type": "hero", "speaker": "teacher", "title": "今天这节课怎么学", "text": "We will move through this article as a guided classroom, not as a wall of text."},
                {"id": "entry-2", "type": "bullet_list", "title": "课堂目标", "items": ["先用 i+1 版本抓住主线意思", "遇到关键难点再回看原文支撑", "最后把理解变成你自己的英文输出"]},
                {"id": "entry-3", "type": "teacher_talk", "speaker": "teacher", "text": "Stay with the flow. You do not need to solve every difficult word before the meaning appears."},
            ],
        },
        {
            "id": "preview",
            "type": "preview",
            "title": "预热与关键词",
            "goal": "先建立阅读预期，再带着关注点进入正文。",
            "beats": [
                {"id": "preview-1", "type": "teacher_talk", "speaker": "teacher", "text": "Before we read closely, scan the watchwords and predict what kind of argument or story is coming."},
                {"id": "preview-2", "type": "keyword_grid", "title": "Watchwords", "keywords": [{"word": word, "reason": f"Important for understanding the text at {body.target_level} level.", "tip": "Try paraphrasing it in simpler English before checking the full sentence again."} for word in keywords]},
                {"id": "preview-3", "type": "teacher_talk", "speaker": "teacher", "text": "When you already know the likely pressure points, the reading becomes much smoother."},
            ],
        },
        {
            "id": "guided-reading",
            "type": "guided_reading",
            "title": "老师带读",
            "goal": "一段一段推进理解，不再上下扫整篇文章。",
            "beats": [{"id": segment["id"], "type": "reading_segment", "speaker": "teacher", "title": segment["heading"], "segment": segment, "aside": segment["focus"], "cta": segment["question"]} for segment in segments],
        },
        {
            "id": "deep-explain",
            "type": "deep_explain",
            "title": "讲透难点",
            "goal": "把真正值钱的词、表达和逻辑讲明白。",
            "beats": [
                {"id": "deep-explain-1", "type": "teacher_talk", "speaker": "teacher", "text": "Now we slow down only for the places that actually change your understanding of the article."},
                {"id": "deep-explain-2", "type": "explanation_grid", "title": "重点拆解", "points": [{"label": word, "explanation": f'Link "{word}" back to the surrounding sentence before translating it word by word.', "example": "Explain the idea in simpler English, then compare it with the original wording."} for word in (keywords[:4] or ["structure", "signal", "detail"])]},
            ],
        },
        {
            "id": "checkpoint",
            "type": "checkpoint",
            "title": "理解检查",
            "goal": "确认你已经抓住文章主线。",
            "beats": [{"id": "checkpoint-1", "type": "teacher_talk", "speaker": "teacher", "text": "Answer quickly. This checkpoint is here to confirm direction, not to trap you."}],
            "task": {
                "instructions": "Answer the questions before moving to the discussion scene.",
                "questions": [
                    {"type": "mcq", "question": "What should you focus on first when reading this lesson?", "options": ["The main idea of each part", "Every difficult word separately", "Only the title", "Only the final paragraph"], "answer": "The main idea of each part"},
                    {"type": "fill", "sentence": "One useful lesson word is ___.", "answer": keywords[0] if keywords else "main idea"},
                ],
            },
        },
        {
            "id": "discussion",
            "type": "discussion",
            "title": "课堂讨论",
            "goal": "先看老师和同学怎么谈，再决定你要不要追问。",
            "beats": [
                {"id": "discussion-1", "type": "conversation", "title": "示范讨论", "messages": [
                    {"speaker": "teacher", "text": "Read the main direction first. The article becomes easier once you stop fighting every difficult phrase."},
                    {"speaker": "student", "text": "So the wording supports the argument, but it is not the first thing I should solve?"},
                    {"speaker": "assistant", "text": "Exactly. Build the meaning route first, then return for precision."},
                ]},
                {"id": "discussion-2", "type": "teacher_talk", "speaker": "teacher", "text": "If one point still feels fuzzy, ask it now instead of carrying confusion into the writing task."},
            ],
            "live_hook": {
                "enabled": True,
                "prompt": "Continue the classroom discussion as the lead reading teacher. Keep the explanation concise, natural, and tied to the article.",
                "suggested_questions": [
                    "Can you restate the main claim in simpler English?",
                    "Which sentence should I reread if I still feel lost?",
                    "What is the most important word or phrase in this article?",
                ],
            },
        },
        {
            "id": "output",
            "type": "output",
            "title": "你的输出",
            "goal": "把输入转成你自己的表达。",
            "beats": [{"id": "output-1", "type": "teacher_talk", "speaker": "teacher", "text": "Now use your own English. Short, clear, and controlled is better than sounding advanced but vague."}],
            "task": {
                "prompt": "Write 3-4 sentences to explain the article's main idea and one supporting detail.",
                "guidance": "Use at least one lesson word and keep your explanation clear.",
                "checklist": ["State the main idea", "Add one supporting detail", "Use one lesson word or phrase"],
            },
        },
        {
            "id": "wrap-up",
            "type": "wrap_up",
            "title": "收束与下一步",
            "goal": "把今天的节奏和重点收回来。",
            "beats": [
                {"id": "wrap-1", "type": "teacher_talk", "speaker": "teacher", "text": "Meaning first, precision second, output last. That is the rhythm of this reading class."},
                {"id": "wrap-2", "type": "bullet_list", "title": "带走三件事", "items": ["Use the i+1 version to enter the text quickly", "Return to the original wording only when precision matters", "Turn reading into output so the language sticks"]},
                {"id": "wrap-3", "type": "teacher_talk", "speaker": "teacher", "text": "Pick one segment after class and paraphrase it aloud in your own English."},
            ],
        },
    ]
    return {
        "schema_version": 2,
        "mode": "reading_classroom_v2",
        "article_id": body.article_id,
        "article_title": title_seed[:120],
        "target_level": body.target_level,
        "generated_at": _utc_iso(),
        "course_meta": {"cover_kicker": "Immersive Reading", "summary": "Teacher-led reading flow with guided explanation, discussion, and output.", "estimated_minutes": max(8, len(scenes) * 2)},
        "cast": {
            "teacher": {"name": "Coach Mira", "persona": "A calm reading coach who helps you move from meaning to language and then to output.", "tone": "focused and encouraging"},
            "assistant": {"name": "Noah", "persona": "A concise teaching assistant who reframes ideas in simpler English.", "tone": "clear and practical"},
            "students": [{"name": "Lena", "persona": "A curious student who asks the question you were about to ask."}],
        },
        "source": {"primary_text": "rewritten", "segment_count": len(segments), "keywords": keywords, "word_counts": {"original": len(_split_sentences(body.original_text)), "rewritten": len(_split_sentences(body.rewritten_text))}},
        "scenes": scenes,
        "runtime": {"activeSceneIndex": 0, "revealCountsByScene": {"entry": 1}, "completedSceneIds": [], "quiz": {}, "output": {}, "discussion": {}, "completedAt": None, "lastViewedAt": int(datetime.now(timezone.utc).timestamp() * 1000), "totalScenes": len(scenes)},
    }


def _sanitize_scene(fallback_scene: dict, scene_payload: dict) -> dict:
    next_scene = json.loads(json.dumps(fallback_scene))
    next_scene["title"] = _trim(scene_payload.get("title") or next_scene["title"], 80) or next_scene["title"]
    next_scene["goal"] = _trim(scene_payload.get("goal") or next_scene["goal"], 160) or next_scene["goal"]
    beats = _safe_list(scene_payload.get("beats"))
    if beats:
        next_beats: list[dict] = []
        for index, beat in enumerate(beats[:6]):
            item = _safe_dict(beat)
            fallback_beat = next_scene["beats"][min(index, len(next_scene["beats"]) - 1)]
            beat_type = _trim(item.get("type") or fallback_beat.get("type"), 40) or fallback_beat.get("type")
            next_beat = {
                "id": _trim(item.get("id") or fallback_beat.get("id"), 60) or fallback_beat.get("id"),
                "type": beat_type,
                "speaker": _trim(item.get("speaker") or fallback_beat.get("speaker"), 24) if item.get("speaker") or fallback_beat.get("speaker") else None,
                "title": _trim(item.get("title") or fallback_beat.get("title"), 120),
                "text": _trim(item.get("text") or fallback_beat.get("text"), 420),
                "aside": _trim(item.get("aside") or fallback_beat.get("aside"), 220),
                "cta": _trim(item.get("cta") or fallback_beat.get("cta"), 220),
            }
            if beat_type == "bullet_list":
                items = [_trim(v, 160) for v in _safe_list(item.get("items")) if _trim(v, 160)]
                next_beat["items"] = items or fallback_beat.get("items", [])
            if beat_type == "keyword_grid":
                keywords = []
                for raw_keyword in _safe_list(item.get("keywords"))[:MAX_KEYWORDS]:
                    keyword = _safe_dict(raw_keyword)
                    word = _trim(keyword.get("word"), 40)
                    if not word:
                        continue
                    keywords.append({"word": word, "reason": _trim(keyword.get("reason"), 180), "tip": _trim(keyword.get("tip"), 180)})
                next_beat["keywords"] = keywords or fallback_beat.get("keywords", [])
            if beat_type == "explanation_grid":
                points = []
                for raw_point in _safe_list(item.get("points"))[:6]:
                    point = _safe_dict(raw_point)
                    label = _trim(point.get("label"), 80)
                    explanation = _trim(point.get("explanation"), 320)
                    if not label or not explanation:
                        continue
                    points.append({"label": label, "explanation": explanation, "example": _trim(point.get("example"), 220)})
                next_beat["points"] = points or fallback_beat.get("points", [])
            if beat_type == "conversation":
                messages = []
                for raw_message in _safe_list(item.get("messages"))[:6]:
                    message = _safe_dict(raw_message)
                    text = _trim(message.get("text") or message.get("content"), 320)
                    if not text:
                        continue
                    messages.append({"speaker": _trim(message.get("speaker") or message.get("role") or "teacher", 24), "text": text})
                next_beat["messages"] = messages or fallback_beat.get("messages", [])
            if beat_type == "reading_segment":
                segment = _safe_dict(item.get("segment"))
                fallback_segment = _safe_dict(fallback_beat.get("segment"))
                next_beat["segment"] = {
                    **fallback_segment,
                    "heading": _trim(segment.get("heading") or fallback_segment.get("heading"), 80) or fallback_segment.get("heading"),
                    "focus": _trim(segment.get("focus") or fallback_segment.get("focus"), 220) or fallback_segment.get("focus"),
                    "teacher_note": _trim(segment.get("teacher_note") or fallback_segment.get("teacher_note"), 320) or fallback_segment.get("teacher_note"),
                    "question": _trim(segment.get("question") or fallback_segment.get("question"), 220) or fallback_segment.get("question"),
                }
                if not next_beat["title"]:
                    next_beat["title"] = next_beat["segment"]["heading"]
            next_beats.append(next_beat)
        next_scene["beats"] = next_beats or next_scene["beats"]
    task = _safe_dict(scene_payload.get("task"))
    if task and next_scene.get("task"):
        if next_scene["type"] == "checkpoint":
            questions = [question for question in _safe_list(task.get("questions")) if isinstance(question, dict) and _validate_question(question)]
            next_scene["task"]["instructions"] = _trim(task.get("instructions") or next_scene["task"].get("instructions"), 220)
            if questions:
                next_scene["task"]["questions"] = questions[:6]
        if next_scene["type"] == "output":
            next_scene["task"]["prompt"] = _trim(task.get("prompt") or next_scene["task"].get("prompt"), 240)
            next_scene["task"]["guidance"] = _trim(task.get("guidance") or next_scene["task"].get("guidance"), 220)
            checklist = [_trim(v, 160) for v in _safe_list(task.get("checklist")) if _trim(v, 160)]
            if checklist:
                next_scene["task"]["checklist"] = checklist[:5]
    live_hook = _safe_dict(scene_payload.get("live_hook"))
    if live_hook and next_scene.get("live_hook"):
        next_scene["live_hook"] = {
            "enabled": live_hook.get("enabled") is not False,
            "prompt": _trim(live_hook.get("prompt") or next_scene["live_hook"].get("prompt"), 320),
            "suggested_questions": [_trim(v, 160) for v in _safe_list(live_hook.get("suggested_questions")) if _trim(v, 160)][:5] or next_scene["live_hook"].get("suggested_questions", []),
        }
    return next_scene


def _merge_course_payload(fallback_course: dict, ai_payload: dict | None) -> dict:
    if not isinstance(ai_payload, dict):
        return fallback_course
    course = json.loads(json.dumps(fallback_course))
    title = _trim(ai_payload.get("title"), 120)
    if title:
        course["article_title"] = title
    course_meta = _safe_dict(ai_payload.get("course_meta"))
    if course_meta:
        course["course_meta"]["cover_kicker"] = _trim(course_meta.get("cover_kicker") or course["course_meta"]["cover_kicker"], 60)
        course["course_meta"]["summary"] = _trim(course_meta.get("summary") or course["course_meta"]["summary"], 240)
        course["course_meta"]["estimated_minutes"] = max(6, int(course_meta.get("estimated_minutes") or course["course_meta"]["estimated_minutes"]))
    cast = _safe_dict(ai_payload.get("cast"))
    if cast:
        teacher = _safe_dict(cast.get("teacher"))
        assistant = _safe_dict(cast.get("assistant"))
        if teacher:
            course["cast"]["teacher"] = {"name": _trim(teacher.get("name") or course["cast"]["teacher"]["name"], 60), "persona": _trim(teacher.get("persona") or course["cast"]["teacher"]["persona"], 240), "tone": _trim(teacher.get("tone") or course["cast"]["teacher"]["tone"], 80)}
        if assistant:
            course["cast"]["assistant"] = {"name": _trim(assistant.get("name") or course["cast"]["assistant"]["name"], 60), "persona": _trim(assistant.get("persona") or course["cast"]["assistant"]["persona"], 240), "tone": _trim(assistant.get("tone") or course["cast"]["assistant"]["tone"], 80)}
    scenes = _safe_list(ai_payload.get("scenes"))
    if scenes:
        merged_scenes = []
        for fallback_scene in course["scenes"]:
            scene_payload = next((item for item in scenes if _trim(_safe_dict(item).get("id"), 60) == fallback_scene["id"]), None)
            merged_scenes.append(_sanitize_scene(fallback_scene, _safe_dict(scene_payload)) if scene_payload else fallback_scene)
        course["scenes"] = merged_scenes
    return course


_COURSE_SYSTEM_PROMPT = """You are a course designer for an immersive English reading classroom app.

The classroom has three participants:
- teacher (Coach Mira): calm, encouraging reading coach. Speaks 2-3 sentences at a time.
- student-lily (Lily): curious, asks "why" and "what does X mean?". Speaks 1-2 sentences.
- student-max (Max): analytical, notices structure and patterns. Speaks 1-2 sentences.

You will receive a fallback course structure. Your job is to REWRITE the content of every scene so it is:
1. Directly based on the actual article text provided.
2. Rich with natural teacher/student dialogue in the beats.
3. Pedagogically sound for the target Collins level.

CRITICAL RULES:
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.
- Preserve every scene id exactly (entry, preview, guided-reading, deep-explain, checkpoint, discussion, output, wrap-up).
- For each scene, rewrite: title, goal, and every beat's text/messages/keywords/points using content from the article.
- For conversation beats: write 3-5 realistic exchanges between teacher/student-lily/student-max. Use their speaker names exactly.
- For checkpoint questions: write questions that test comprehension of THIS article specifically. Do not use generic placeholders.
- For output task: write a prompt that asks the learner to respond to something specific in the article.
- Keep beat text concise: teacher_talk max 60 words, conversation messages max 25 words each.
- keyword_grid: choose words that actually appear in the article and matter for comprehension.
- explanation_grid: explain vocabulary or grammar structures that appear in the article.

Return JSON matching this exact top-level shape:
{
  "title": "string",
  "course_meta": {"cover_kicker": "string", "summary": "string", "estimated_minutes": int},
  "cast": {
    "teacher": {"name": "Coach Mira", "persona": "string", "tone": "string"},
    "assistant": {"name": "Noah", "persona": "string", "tone": "string"},
    "students": [{"name": "Lily", "persona": "string"}, {"name": "Max", "persona": "string"}]
  },
  "scenes": [ ...same structure as fallback, same scene ids... ]
}"""


@router.post("/reading-course/generate", response_model=ReadingCourseGenerateResponse, responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def generate_reading_course_endpoint(body: ReadingCourseGenerateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)
    fallback_course = _build_fallback_course(body)

    # Send the fallback as the structural template + article text for content grounding
    user_content = (
        f"Target Collins level: {body.target_level}\n"
        f"Key vocabulary: {', '.join(_dedupe_words([*body.valid_above_i1_words, *body.valid_i1_words])[:12])}\n\n"
        f"REWRITTEN ARTICLE (i+1 version — use this as primary teaching material):\n{body.rewritten_text[:MAX_TEXT_CHARS]}\n\n"
        f"ORIGINAL ARTICLE (for reference):\n{body.original_text[:3000]}\n\n"
        f"FALLBACK STRUCTURE TO REWRITE (preserve scene ids, rewrite all text content):\n"
        + json.dumps(
            {
                "scenes": [
                    {
                        "id": s["id"],
                        "type": s["type"],
                        "title": s["title"],
                        "goal": s["goal"],
                        "beats": s.get("beats", []),
                        "task": s.get("task"),
                        "live_hook": s.get("live_hook"),
                    }
                    for s in fallback_course["scenes"]
                ]
            },
            ensure_ascii=False,
        )
    )
    messages = [
        {"role": "system", "content": _COURSE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    try:
        raw_response, usage = llm_root.call_deepseek(messages=messages, api_key=api_key, enable_thinking=False, stream=False, temperature=0.5, max_tokens=8192)
    except Exception as exc:
        logger.warning("Reading course generation failed, returning fallback: %s", exc)
        return ReadingCourseGenerateResponse(ok=True, course=fallback_course)

    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    parsed_payload = None
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
            charge = llm_root.calculate_llm_charge_by_tokens(total_tokens=total_tokens, points_per_1k_tokens=rate.points_per_1k_tokens)
            if charge > 0:
                llm_root.consume_points(db, user_id=current_user.id, points=charge, model_name=llm_root.LLM_MODEL_DEEPSEEK_FAST, lesson_id=None, event_type=llm_root.EVENT_CONSUME_LLM, note=f"reading course generation, tokens={total_tokens}")
                db.commit()
    except Exception:
        logger.warning("Reading course billing failed silently for user %s", current_user.id)
    return ReadingCourseGenerateResponse(ok=True, course=course)


def _find_scene(course: dict[str, Any], scene_id: str) -> dict[str, Any] | None:
    for scene in _safe_list(course.get("scenes")):
        item = _safe_dict(scene)
        if str(item.get("id") or "") == scene_id:
            return item
    return None


@router.post("/reading-course/discussion", response_model=ReadingCourseDiscussionResponse, responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def continue_reading_course_discussion(body: ReadingCourseDiscussionRequest, current_user: User = Depends(get_current_user)):
    from app.services.ai_platform import call_llm_chat as call_deepseek

    api_key = _require_api_key()
    scene = _find_scene(body.course, body.scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found in course payload")

    teacher = _safe_dict(_safe_dict(body.course.get("cast")).get("teacher"))
    live_hook = _safe_dict(scene.get("live_hook") or scene.get("liveHook"))
    scene_summary_lines = []
    for beat in _safe_list(scene.get("beats"))[:4]:
        item = _safe_dict(beat)
        if item.get("type") == "reading_segment":
            segment = _safe_dict(item.get("segment"))
            scene_summary_lines.append(f"- {segment.get('heading')}: {_trim(segment.get('rewritten_text'), 220)}")
        elif item.get("type") == "conversation":
            for message in _safe_list(item.get("messages"))[:4]:
                msg = _safe_dict(message)
                scene_summary_lines.append(f"- {_trim(msg.get('speaker'), 24)}: {_trim(msg.get('text') or msg.get('content'), 220)}")
        else:
            text = _trim(item.get("text"), 220)
            if text:
                scene_summary_lines.append(f"- {item.get('type')}: {text}")

    system_prompt = (
        "You are the lead teacher in an immersive English reading classroom.\n"
        "Keep each reply to 2-4 sentences. Stay teacher-led, concise, and tied to the article.\n"
        "If the learner writes Chinese, you may mix Chinese and English lightly, but keep the answer mostly English when possible.\n"
        f"Course title: {_trim(body.course.get('article_title'), 120)}\n"
        f"Target level: {_trim(body.course.get('target_level'), 8)}\n"
        f"Teacher: {_trim(teacher.get('name') or 'Teacher', 60)}\n"
        f"Teacher persona: {_trim(teacher.get('persona'), 220)}\n"
        f"Scene title: {_trim(scene.get('title'), 120)}\n"
        f"Scene goal: {_trim(scene.get('goal'), 220)}\n"
        + (f"Live hook: {_trim(live_hook.get('prompt'), 320)}\n" if live_hook else "")
        + "Scene material:\n"
        + "\n".join(scene_summary_lines[:8])
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in body.history[-8:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})
    try:
        reply, usage = call_deepseek(messages, api_key, enable_thinking=False, temperature=0.65, max_tokens=320)
    except Exception as exc:
        logger.exception("reading_course discussion failed user_id=%s scene_id=%s", current_user.id, body.scene_id)
        raise HTTPException(status_code=502, detail=f"AI response failed: {type(exc).__name__}") from exc
    if not reply or not reply.strip():
        raise HTTPException(status_code=502, detail="AI returned empty response")
    return ReadingCourseDiscussionResponse(ok=True, reply=reply.strip(), usage={"prompt_tokens": usage.prompt_tokens, "completion_tokens": usage.completion_tokens})


# ─────────────────────────────────────────────────────────────
# V3 Course Generation — Dynamic Sections
# ─────────────────────────────────────────────────────────────

class V3CourseGenerateRequest(BaseModel):
    article_id: str = Field(..., min_length=1)
    article_title: str = ""
    original_text: str = Field(..., min_length=20)
    rewritten_text: str = Field(..., min_length=20)
    target_level: int = Field(3, ge=1, le=5)
    rewrite_mappings: list[dict] = Field(default_factory=list)  # [{original, replacement}]
    valid_above_i1_words: list[str] = Field(default_factory=list)
    word_levels: dict[str, str] = Field(default_factory=dict)


class V3CourseGenerateResponse(BaseModel):
    ok: bool
    course: dict


def _split_into_paragraphs(text: str, max_words_per_section: int = 250) -> list[str]:
    """Split text by blank lines or single newlines (natural paragraphs). Long paragraphs are halved."""
    normalized = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    # Try double-newline splits first; fall back to single-newline
    raw_paragraphs = [p.strip() for p in normalized.split("\n\n") if p.strip()]
    if len(raw_paragraphs) <= 1:
        # Article uses single newlines as paragraph breaks
        raw_paragraphs = [p.strip() for p in normalized.split("\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [normalized]

    result: list[str] = []
    for para in raw_paragraphs:
        words = para.split()
        if len(words) <= max_words_per_section:
            result.append(para)
        else:
            # Split long paragraph at sentence boundary near the midpoint
            sentences = re.split(r"(?<=[.!?])\s+", para)
            mid = len(sentences) // 2
            result.append(" ".join(sentences[:mid]))
            result.append(" ".join(sentences[mid:]))
    return [p for p in result if p]


_V3_SYSTEM_PROMPT = """You are an English reading course designer.

Given a rewritten (i+1) article split into sections, generate a JSON course with this EXACT shape:
{
  "title": "string",
  "sections": [
    {
      "id": "section-1",
      "title": "string (short section heading)",
      "summary": "string (1-2 sentences in Chinese: what this section is about)",
      "spotlight_words": ["word1", "word2"],
      "quiz": [
        {
          "type": "mcq",
          "question": "string",
          "options": [{"label": "string", "value": "A"}, {"label": "string", "value": "B"}, {"label": "string", "value": "C"}, {"label": "string", "value": "D"}],
          "answer": "A",
          "analysis": "string (1 sentence explaining why)"
        }
      ]
    }
  ]
}

Rules:
- Return ONLY valid JSON. No markdown fences, no explanation.
- sections array must have same count and order as provided sections.
- title: 4-8 word heading capturing the section's main point.
- summary: 1-2 sentences in Chinese summarizing what the learner will read.
- spotlight_words: 2-3 words from THIS section that are pedagogically important (vocabulary, discourse markers, or key concepts). Choose words that ACTUALLY APPEAR in the section text.
- quiz: exactly 1 question testing comprehension of THIS section. type MUST be "mcq". Write 4 real options (A/B/C/D) directly about the section content — no placeholders. Question must be answerable from the section text alone.
- analysis: 1 concise sentence explaining the correct answer.
"""


def _build_v3_fallback(body: V3CourseGenerateRequest, rewritten_paragraphs: list[str]) -> dict:
    sections = []
    for i, para in enumerate(rewritten_paragraphs):
        words = para.split()
        section_id = f"section-{i + 1}"
        # Pick first few meaningful words as spotlight candidates
        content_words = [w.strip(".,!?\"'()[]") for w in words if len(w) > 4][:3]
        sections.append({
            "id": section_id,
            "title": f"Part {i + 1}",
            "summary": "阅读本段，注意主要观点和关键词汇。",
            "rewritten_text": para,
            "spotlight_words": content_words[:2] if content_words else [],
            "quiz": [
                {
                    "type": "mcq",
                    "question": "What is the main idea of this section?",
                    "options": [
                        {"label": "The main idea of the section", "value": "A"},
                        {"label": "A supporting detail", "value": "B"},
                        {"label": "An unrelated point", "value": "C"},
                        {"label": "The author's conclusion only", "value": "D"},
                    ],
                    "answer": "A",
                    "analysis": "The main idea is stated in the opening sentence.",
                }
            ],
        })

    return {
        "schema_version": 3,
        "mode": "reading_classroom_v3",
        "article_id": body.article_id,
        "article_title": str(body.article_title or "").strip()[:120] or "Reading Classroom",
        "target_level": body.target_level,
        "generated_at": _utc_iso(),
        "rewrite_mappings": body.rewrite_mappings,
        "participants": [
            {"id": "teacher", "name": "Coach Mira", "role": "teacher", "color": "#7c3aed", "voice": "longxiaochun"},
            {"id": "student-lily", "name": "Lily", "role": "student", "color": "#2563eb", "voice": "longxiaoxia"},
        ],
        "sections": sections,
        "runtime": {
            "activeSectionIndex": 0,
            "activePhase": "read",
            "completedSections": [],
            "lastViewedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        },
    }


def _merge_v3_sections(fallback_sections: list[dict], ai_sections: list[dict]) -> list[dict]:
    result = []
    for i, fallback in enumerate(fallback_sections):
        if i >= len(ai_sections):
            result.append(fallback)
            continue
        ai = _safe_dict(ai_sections[i])

        merged = dict(fallback)  # keep rewritten_text and id from fallback
        merged["title"] = _trim(ai.get("title") or fallback["title"], 80) or fallback["title"]
        merged["summary"] = _trim(ai.get("summary") or fallback["summary"], 320) or fallback["summary"]

        # spotlight_words
        sw = [_trim(w, 40) for w in _safe_list(ai.get("spotlight_words")) if _trim(w, 40)]
        merged["spotlight_words"] = sw[:3] if sw else fallback["spotlight_words"]

        # quiz
        ai_quiz = _safe_list(ai.get("quiz"))
        valid_quiz = [q for q in ai_quiz if isinstance(q, dict) and _validate_question(q)]
        merged["quiz"] = valid_quiz[:2] if valid_quiz else fallback["quiz"]

        result.append(merged)
    return result


@router.post(
    "/reading-course/generate-v3",
    response_model=V3CourseGenerateResponse,
    responses={503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def generate_v3_course_endpoint(
    body: V3CourseGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a v3 dynamic-section reading course."""
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)

    # Split rewritten text into sections by natural paragraphs
    rewritten_paragraphs = _split_into_paragraphs(body.rewritten_text)
    if not rewritten_paragraphs:
        rewritten_paragraphs = [body.rewritten_text]

    fallback = _build_v3_fallback(body, rewritten_paragraphs)

    # Ask LLM to enrich: titles, summaries, spotlight words, quiz per section
    sections_for_llm = [
        {"id": f"section-{i + 1}", "text": para[:1200]}
        for i, para in enumerate(rewritten_paragraphs)
    ]
    user_content = (
        f"Article title: {body.article_title or 'Reading Classroom'}\n"
        f"Target Collins level: {body.target_level}\n"
        f"Key vocabulary (i+1 words): {', '.join(body.valid_above_i1_words[:10])}\n\n"
        "Sections to process:\n"
        + json.dumps(sections_for_llm, ensure_ascii=False)
    )
    messages = [
        {"role": "system", "content": _V3_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.5,
            max_tokens=max(2048, len(rewritten_paragraphs) * 600),
        )
    except Exception as exc:
        logger.warning("V3 course generation LLM failed, returning fallback: %s", exc)
        return V3CourseGenerateResponse(ok=True, course=fallback)

    recovered = recover_json_payload(raw_response) or strip_json_fences(raw_response)
    try:
        parsed = json.loads(recovered)
        ai_sections = _safe_list(_safe_dict(parsed).get("sections"))
        if ai_sections:
            fallback["sections"] = _merge_v3_sections(fallback["sections"], ai_sections)
        title = _trim(_safe_dict(parsed).get("title"), 120)
        if title:
            fallback["article_title"] = title
    except Exception:
        logger.warning("V3 course JSON parse failed. Raw: %.300s", raw_response)

    # Billing
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
                    note=f"v3 course generation, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("V3 course billing failed silently for user %s", current_user.id)

    return V3CourseGenerateResponse(ok=True, course=fallback)


# ─────────────────────────────────────────────────────────────
# Explain Actions — real-time generation for explain phase
# ─────────────────────────────────────────────────────────────

class ExplainGenerateRequest(BaseModel):
    section_id: str = Field(..., min_length=1)
    section_text: str = Field(..., min_length=10, max_length=3000)
    confused_words: list[str] = Field(default_factory=list)
    color_marks: list[dict] = Field(default_factory=list)  # [{text, color}]
    default_spotlight_words: list[str] = Field(default_factory=list)
    target_level: int = Field(3, ge=1, le=5)
    article_title: str = ""
    teacher_name: str = "Coach Mira"


class ExplainGenerateResponse(BaseModel):
    ok: bool
    actions: list[dict]


_EXPLAIN_SYSTEM_PROMPT = """You are generating a short teaching script for a reading classroom explain phase.

The teacher will walk the student through 2-3 key words or phrases from the section text.
For each word, produce a spotlight action then a speech action then a pause action.

If the user has highlighted text (color_marks provided), address EACH highlighted segment FIRST — before the default spotlight words. Include a spotlight action for the highlighted word/phrase and a speech action explaining why it matters in context.

Return ONLY valid JSON:
{
  "actions": [
    {"type": "spotlight", "target_word": "word_exactly_as_in_text", "sentence_hint": "exact sentence containing the word"},
    {"type": "speech", "speaker": "teacher", "text": "Teacher explanation (2-3 sentences, max 60 words)"},
    {"type": "pause", "duration_ms": 1500},
    ...repeat for each word...
    {"type": "speech", "speaker": "teacher", "text": "Brief closing remark (1 sentence)"}
  ]
}

Rules:
- ONLY valid JSON. No markdown, no extra text.
- target_word must appear EXACTLY in the section text (case-insensitive match is fine, but return the form as in text).
- sentence_hint: copy the full sentence containing the word from the section text.
- Choose 2-3 words: prioritize confused_words list first, then default_spotlight_words.
- Speech is natural, concise, tied to the specific sentence. Mention the sentence context, not generic definitions.
- End with a brief encouraging closing remark from the teacher.
- No greetings, no "welcome back", no "let's get started" — jump straight into the first spotlight.
"""


@router.post(
    "/reading-course/generate-explain",
    response_model=ExplainGenerateResponse,
    responses={502: {"model": ErrorResponse}},
)
def generate_explain_actions(
    body: ExplainGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    from app.services.ai_platform import call_llm_chat as call_deepseek

    api_key = _require_api_key()

    # Determine which words to spotlight (confused first, then defaults)
    confused = [w for w in body.confused_words if w and len(w) < 60]
    defaults = [w for w in body.default_spotlight_words if w and len(w) < 60]
    # Combine and dedupe, max 3
    seen: set[str] = set()
    candidates: list[str] = []
    for w in confused + defaults:
        lw = w.lower()
        if lw not in seen:
            seen.add(lw)
            candidates.append(w)
        if len(candidates) >= 3:
            break

    if not candidates:
        # Fallback: pick 2 words longer than 6 chars from section text
        words = [w.strip(".,!?\"'()[]") for w in body.section_text.split() if len(w) > 6]
        candidates = list(dict.fromkeys(words))[:2]

    color_marks_desc = ""
    if body.color_marks:
        marks_list = "; ".join(f'"{m.get("text","")}" ({m.get("color","")})' for m in body.color_marks[:6] if m.get("text"))
        color_marks_desc = f"User-highlighted text (address these FIRST): {marks_list}\n"

    user_msg = (
        f"Article title: {body.article_title or 'Reading'}\n"
        f"Target level: {body.target_level}\n"
        f"Teacher name: {body.teacher_name}\n"
        f"Confused words (must teach first): {', '.join(confused) or 'none'}\n"
        f"{color_marks_desc}"
        f"Default spotlight words: {', '.join(defaults) or 'none'}\n\n"
        f"Section text:\n{body.section_text[:2000]}"
    )

    try:
        raw, _ = call_deepseek(
            [
                {"role": "system", "content": _EXPLAIN_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            api_key,
            enable_thinking=False,
            temperature=0.4,
            max_tokens=800,
        )
        recovered = recover_json_payload(raw) or strip_json_fences(raw)
        parsed = json.loads(recovered)
        actions = _safe_list(_safe_dict(parsed).get("actions"))

        # Validate and sanitize each action
        clean_actions: list[dict] = []
        for a in actions[:12]:  # cap at 12 actions
            item = _safe_dict(a)
            action_type = _trim(item.get("type"), 20)
            if action_type == "spotlight":
                target = _trim(item.get("target_word"), 80)
                if target:
                    clean_actions.append({
                        "type": "spotlight",
                        "target_word": target,
                        "sentence_hint": _trim(item.get("sentence_hint"), 300),
                    })
            elif action_type == "speech":
                text = _trim(item.get("text"), 400)
                if text:
                    clean_actions.append({
                        "type": "speech",
                        "speaker": _trim(item.get("speaker") or "teacher", 30),
                        "text": text,
                    })
            elif action_type == "pause":
                duration = max(500, min(3000, int(item.get("duration_ms") or 1500)))
                clean_actions.append({"type": "pause", "duration_ms": duration})

        if not clean_actions:
            raise ValueError("empty actions")

        return ExplainGenerateResponse(ok=True, actions=clean_actions)

    except Exception as exc:
        logger.warning("generate_explain_actions failed: %s", exc)
        # Fallback: minimal explain script
        fallback_word = candidates[0] if candidates else "this concept"
        return ExplainGenerateResponse(ok=True, actions=[
            {"type": "speech", "speaker": "teacher",
             "text": f"Let's look at the key ideas in this section. Pay attention to how the author uses '{fallback_word}' here."},
            {"type": "pause", "duration_ms": 1500},
            {"type": "speech", "speaker": "teacher",
             "text": "Take a moment to re-read this section with these points in mind."},
        ])


# ─────────────────────────────────────────────────────────────
# Discuss Actions — auto-generated AI discussion script
# ─────────────────────────────────────────────────────────────

class DiscussGenerateRequest(BaseModel):
    section_id: str = Field(..., min_length=1)
    section_text: str = Field(..., min_length=10, max_length=3000)
    quiz_questions: list[dict] = Field(default_factory=list)
    article_title: str = ""
    teacher_name: str = "Coach Mira"
    student_names: list[str] = Field(default_factory=list)
    target_level: int = Field(3, ge=1, le=5)


class DiscussGenerateResponse(BaseModel):
    ok: bool
    actions: list[dict]


_DISCUSS_SYSTEM_PROMPT = """You are generating a short classroom discussion script for an English reading classroom.

After the quiz, the teacher opens a discussion about the section content. A student responds and the teacher replies.
This should feel like a natural, lively 2-3 turn conversation — not a lecture.

Return ONLY valid JSON:
{
  "actions": [
    {"type": "speech", "speaker": "teacher", "text": "Discussion opener (1-2 sentences, poses an interesting question or observation about the section)"},
    {"type": "pause", "duration_ms": 800},
    {"type": "speech", "speaker": "student", "text": "Student response (1-2 sentences, curious or analytical reaction)"},
    {"type": "pause", "duration_ms": 600},
    {"type": "speech", "speaker": "teacher", "text": "Teacher follow-up (1-2 sentences, deepens the point or adds nuance)"},
    {"type": "pause", "duration_ms": 600},
    {"type": "speech", "speaker": "student", "text": "Student follow-up (optional, 1 sentence)"},
    {"type": "pause", "duration_ms": 600},
    {"type": "speech", "speaker": "teacher", "text": "Closing remark inviting the user to join: 'What do you think?' or similar (1 sentence)"}
  ]
}

Rules:
- ONLY valid JSON. No markdown.
- speaker must be exactly "teacher" or "student".
- Content must reference THIS section text specifically — no generic responses.
- Keep each speech under 40 words.
- End with the teacher inviting the user to contribute.
"""


@router.post(
    "/reading-course/generate-discuss",
    response_model=DiscussGenerateResponse,
    responses={502: {"model": ErrorResponse}},
)
def generate_discuss_actions(
    body: DiscussGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    from app.services.ai_platform import call_llm_chat as call_deepseek

    api_key = _require_api_key()

    student_name = body.student_names[0] if body.student_names else "Lily"
    quiz_ctx = ""
    if body.quiz_questions:
        q = body.quiz_questions[0]
        quiz_ctx = f"Quiz question for this section: {q.get('question', '')}\n"

    user_msg = (
        f"Article title: {body.article_title or 'Reading'}\n"
        f"Target level: {body.target_level}\n"
        f"Teacher name: {body.teacher_name}\n"
        f"Student name: {student_name}\n"
        f"{quiz_ctx}\n"
        f"Section text:\n{body.section_text[:2000]}"
    )

    try:
        raw, _ = call_deepseek(
            [
                {"role": "system", "content": _DISCUSS_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            api_key,
            enable_thinking=False,
            temperature=0.6,
            max_tokens=600,
        )
        recovered = recover_json_payload(raw) or strip_json_fences(raw)
        parsed = json.loads(recovered)
        actions = _safe_list(_safe_dict(parsed).get("actions"))

        clean_actions: list[dict] = []
        for a in actions[:12]:
            item = _safe_dict(a)
            action_type = _trim(item.get("type"), 20)
            if action_type == "speech":
                text = _trim(item.get("text"), 300)
                if text:
                    clean_actions.append({
                        "type": "speech",
                        "speaker": _trim(item.get("speaker") or "teacher", 30),
                        "text": text,
                    })
            elif action_type == "pause":
                duration = max(400, min(2000, int(item.get("duration_ms") or 600)))
                clean_actions.append({"type": "pause", "duration_ms": duration})

        if not clean_actions:
            raise ValueError("empty actions")

        return DiscussGenerateResponse(ok=True, actions=clean_actions)

    except Exception as exc:
        logger.warning("generate_discuss_actions failed: %s", exc)
        return DiscussGenerateResponse(ok=True, actions=[
            {"type": "speech", "speaker": "teacher",
             "text": "What did you find most interesting about this section? Feel free to share your thoughts."},
            {"type": "pause", "duration_ms": 800},
            {"type": "speech", "speaker": "student",
             "text": "I think the main point here connects to what we read earlier."},
            {"type": "pause", "duration_ms": 600},
            {"type": "speech", "speaker": "teacher",
             "text": "Exactly. What do you think about it?"},
        ])


# ─────────────────────────────────────────────────────────────
# Word Definition — real-time LLM lookup for word card
# ─────────────────────────────────────────────────────────────

class WordDefinitionRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=80)
    context_sentence: str = Field("", max_length=400)
    target_level: int = Field(3, ge=1, le=5)


class WordDefinitionResponse(BaseModel):
    ok: bool
    word: str
    definition: str
    collins: int
    phonetic: str = ""


@router.post(
    "/reading-course/word-definition",
    response_model=WordDefinitionResponse,
    responses={502: {"model": ErrorResponse}},
)
def get_word_definition(
    body: WordDefinitionRequest,
    current_user: User = Depends(get_current_user),
):
    from app.services.ai_platform import call_llm_chat as call_deepseek

    api_key = _require_api_key()
    system = (
        "You are a concise English dictionary for language learners.\n"
        "Return ONLY valid JSON with exactly these fields:\n"
        '{"definition": "Chinese definition (1 sentence, max 20 chars)", "collins": 3, "phonetic": "IPA or empty string"}\n'
        "No markdown. No extra fields. Definition must be in Chinese."
    )
    context_hint = f"\nContext: {body.context_sentence}" if body.context_sentence else ""
    user_msg = f"Word: {body.word}{context_hint}\nLearner target level: {body.target_level}"

    try:
        raw, _ = call_deepseek(
            [{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            api_key,
            enable_thinking=False,
            temperature=0.2,
            max_tokens=120,
        )
        recovered = recover_json_payload(raw) or strip_json_fences(raw)
        parsed = json.loads(recovered)
        return WordDefinitionResponse(
            ok=True,
            word=body.word,
            definition=_trim(parsed.get("definition", ""), 80) or body.word,
            collins=int(parsed.get("collins", 3) or 3),
            phonetic=_trim(parsed.get("phonetic", ""), 80),
        )
    except Exception as exc:
        logger.warning("word_definition failed for %r: %s", body.word, exc)
        raise HTTPException(status_code=502, detail="Definition lookup failed")

