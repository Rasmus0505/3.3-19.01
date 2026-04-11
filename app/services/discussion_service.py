"""Multi-agent discussion service — lightweight orchestration.

3 fixed roles: Teacher, Student (AI), User (human).
Python-direct LLM calls, no LangGraph needed.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Generator

from app.core.config import DASHSCOPE_API_KEY
from app.infra.llm.deepseek import call_deepseek

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts" / "discussion"

AGENT_ROLES = ("teacher", "student", "user")

AGENT_COLORS = {
    "teacher": "#7c3aed",  # purple
    "student": "#3b82f6",  # blue
    "user": "#10b981",     # green
}


@dataclass
class DiscussionMessage:
    role: str          # teacher / student / user
    content: str
    timestamp: float = 0.0


@dataclass
class DiscussionState:
    topic: str
    target_level: str
    messages: list[DiscussionMessage] = field(default_factory=list)
    key_points: list[str] = field(default_factory=list)
    vocabulary_focus: list[str] = field(default_factory=list)
    current_turn: str = "teacher"   # whose turn it is
    turn_count: int = 0
    max_turns: int = 10


def _load_prompt_template(role: str) -> str:
    """Load prompt template from markdown file."""
    prompt_file = PROMPTS_DIR / f"{role}.md"
    if prompt_file.exists():
        return prompt_file.read_text(encoding="utf-8")
    # Fallback inline prompts
    fallbacks = {
        "teacher": "You are an English teacher. Guide the discussion at CEFR level {target_level}. Speak in English only. Keep responses concise (2-4 sentences).",
        "student": "You are an English learner at CEFR level {target_level}. Ask questions and make occasional minor mistakes. Speak in English only. Keep responses short (1-3 sentences).",
    }
    return fallbacks.get(role, "")


def _build_system_prompt(role: str, target_level: str) -> str:
    """Build system prompt for an agent role."""
    template = _load_prompt_template(role)
    return template.format(target_level=target_level)


def _build_messages_for_agent(
    state: DiscussionState,
    role: str,
) -> list[dict]:
    """Build the message list for a specific agent's LLM call."""
    system_prompt = _build_system_prompt(role, state.target_level)

    messages = [{"role": "system", "content": system_prompt}]

    # Add context about the discussion
    context = f"Discussion topic: {state.topic}\n"
    if state.key_points:
        context += f"Key points to cover: {', '.join(state.key_points)}\n"
    if state.vocabulary_focus:
        context += f"Target vocabulary: {', '.join(state.vocabulary_focus)}\n"

    messages.append({"role": "system", "content": context})

    # Add conversation history (last N messages for context window)
    history = state.messages[-10:]  # Keep last 10 messages
    for msg in history:
        if msg.role == "user":
            messages.append({"role": "user", "content": f"[Learner]: {msg.content}"})
        elif msg.role == role:
            messages.append({"role": "assistant", "content": msg.content})
        else:
            # Other agent's messages as system context
            agent_label = "Teacher" if msg.role == "teacher" else "Student"
            messages.append({"role": "user", "content": f"[{agent_label}]: {msg.content}"})

    return messages


def generate_agent_response(
    state: DiscussionState,
    role: str,
    api_key: str | None = None,
) -> str:
    """Generate a response for a specific agent role."""
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY is required")

    messages = _build_messages_for_agent(state, role)

    content, _ = call_deepseek(
        messages=messages,
        api_key=api_key,
        enable_thinking=False,
        stream=False,
        temperature=0.8 if role == "student" else 0.7,
        max_tokens=256,
    )

    return content.strip()


def generate_teacher_opening(
    topic: str,
    teacher_prompt: str,
    target_level: str,
    api_key: str | None = None,
) -> str:
    """Generate the teacher's opening statement for a discussion scene."""
    api_key = api_key or DASHSCOPE_API_KEY
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY is required")

    system_prompt = _build_system_prompt("teacher", target_level)
    user_prompt = (
        f"Start a discussion on the topic: '{topic}'.\n"
        f"Opening context: {teacher_prompt}\n"
        f"Begin by introducing the topic and asking the student a question. "
        f"Keep it to 2-3 sentences."
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
        max_tokens=256,
    )

    return content.strip()


def start_discussion(
    topic: str,
    target_level: str,
    key_points: list[str] | None = None,
    vocabulary_focus: list[str] | None = None,
    teacher_prompt: str = "",
    api_key: str | None = None,
) -> DiscussionState:
    """Start a new discussion and generate the teacher's opening."""
    state = DiscussionState(
        topic=topic,
        target_level=target_level,
        key_points=key_points or [],
        vocabulary_focus=vocabulary_focus or [],
    )

    # Generate teacher's opening
    opening = generate_teacher_opening(topic, teacher_prompt, target_level, api_key=api_key)
    state.messages.append(DiscussionMessage(role="teacher", content=opening))
    state.current_turn = "student"
    state.turn_count = 1

    return state


def advance_discussion(
    state: DiscussionState,
    user_message: str | None = None,
    api_key: str | None = None,
) -> Generator[DiscussionMessage, None, None]:
    """Advance the discussion by one exchange.

    If user_message is provided, it's the user's turn.
    Otherwise, the AI student responds, then the teacher responds.

    Yields each new message as it's generated.
    """
    # If user provides a message, add it
    if user_message:
        user_msg = DiscussionMessage(role="user", content=user_message)
        state.messages.append(user_msg)
        yield user_msg
        state.current_turn = "teacher"

    # Generate the next agent's response
    if state.current_turn == "student":
        response = generate_agent_response(state, "student", api_key=api_key)
        msg = DiscussionMessage(role="student", content=response)
        state.messages.append(msg)
        yield msg
        state.current_turn = "teacher"
        state.turn_count += 1

    elif state.current_turn == "teacher":
        response = generate_agent_response(state, "teacher", api_key=api_key)
        msg = DiscussionMessage(role="teacher", content=response)
        state.messages.append(msg)
        yield msg
        state.current_turn = "student"
        state.turn_count += 1


def generate_discussion_summary(
    state: DiscussionState,
    api_key: str | None = None,
) -> str:
    """Generate a teacher's summary of the discussion."""
    api_key = api_key or DASHSCOPE_API_KEY

    system_prompt = _build_system_prompt("teacher", state.target_level)

    conversation = "\n".join(
        f"{'Teacher' if m.role == 'teacher' else 'Student' if m.role == 'student' else 'Learner'}: {m.content}"
        for m in state.messages
    )

    user_prompt = (
        f"The discussion on '{state.topic}' is ending. Summarize the key points "
        f"covered and any new vocabulary learned. Keep it to 2-3 sentences.\n\n"
        f"Discussion:\n{conversation}"
    )

    content, _ = call_deepseek(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        api_key=api_key,
        enable_thinking=False,
        stream=False,
        temperature=0.5,
        max_tokens=256,
    )

    return content.strip()
