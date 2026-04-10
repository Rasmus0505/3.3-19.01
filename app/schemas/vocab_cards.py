"""Pydantic schemas for vocabulary card generation — Phase 42."""

from __future__ import annotations

from pydantic import BaseModel


class VocabCardWordInput(BaseModel):
    word: str
    cefr_level: str | None = None
    context_sentence: str | None = None


class VocabCardGenerateRequest(BaseModel):
    words: list[VocabCardWordInput]
    target_level: str
    context_text: str


class VocabCardResult(BaseModel):
    word: str
    cefr_level: str | None = None
    definition: str = ""
    example_sentence: str = ""
    image_url: str | None = None


class VocabCardGenerateResponse(BaseModel):
    ok: bool
    cards: list[VocabCardResult]


class VocabCardImageRequest(BaseModel):
    word: str
    definition: str
    example_sentence: str


class VocabCardImageResponse(BaseModel):
    ok: bool
    word: str
    image_url: str
