from __future__ import annotations

from app.api.serializers import to_lesson_catalog_item_response, to_lesson_detail_response
from app.repositories.lessons import get_lesson_for_user, get_lesson_sentences, list_lesson_catalog_for_user
from app.services.query_cache import query_cache


LESSON_CATALOG_TTL_SECONDS = 300


def _lesson_catalog_namespace(user_id: int) -> str:
    return f"lesson_catalog:{int(user_id)}"


def invalidate_lesson_catalog_cache(user_id: int) -> None:
    query_cache.invalidate_namespace(_lesson_catalog_namespace(user_id))


def get_lesson_catalog_payload(
    db,
    *,
    user_id: int,
    page: int,
    page_size: int,
    query: str = "",
) -> dict[str, object]:
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(int(page_size or 20), 100))
    normalized_query = str(query or "").strip()

    def _load() -> dict[str, object]:
        rows, total = list_lesson_catalog_for_user(
            db,
            user_id=user_id,
            page=safe_page,
            page_size=safe_page_size,
            query=normalized_query,
        )
        items = [
            to_lesson_catalog_item_response(
                row["lesson"],
                sentence_count=int(row.get("sentence_count") or 0),
                progress_summary=row.get("progress_summary"),
            )
            for row in rows
        ]
        return {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": int(total),
            "has_more": safe_page * safe_page_size < int(total),
            "items": items,
        }

    return query_cache.get_or_set(
        _lesson_catalog_namespace(user_id),
        {"page": safe_page, "page_size": safe_page_size, "query": normalized_query},
        LESSON_CATALOG_TTL_SECONDS,
        _load,
    )


def get_lesson_detail_payload(db, *, lesson_id: int, user_id: int):
    lesson = get_lesson_for_user(db, lesson_id, user_id)
    if not lesson:
        return None
    sentences = get_lesson_sentences(db, lesson.id)
    return to_lesson_detail_response(lesson, sentences)
