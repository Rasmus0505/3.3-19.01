from __future__ import annotations

from pydantic import BaseModel, Field


class DictionaryCollinsClassifyRequest(BaseModel):
    tokens: list[str] = Field(default_factory=list)
    include_entry: bool = False


class DictionaryEntryPayload(BaseModel):
    lemma: str
    phonetic: str | None = None
    translation: str | None = None
    pos: str | None = None
    collins: int | None = None
    oxford: bool = False
    tags: str | None = None


class DictionaryCollinsClassifyItem(BaseModel):
    token: str
    normalized: str
    lemma: str | None = None
    matched: bool = False
    collins: int | None = None
    band: str
    entry: DictionaryEntryPayload | None = None


class DictionaryCollinsClassifyResponse(BaseModel):
    ok: bool = True
    user_collins_level: int
    items: list[DictionaryCollinsClassifyItem] = Field(default_factory=list)
