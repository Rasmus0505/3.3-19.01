# Stack Research

**Domain:** Import flow UX + video content extraction
**Researched:** 2026-04-02
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Radix UI Dialog | 1.1.15 | Modal dialog for generation config | Already in use (AnnouncementModal pattern), no new dependency |
| Radix UI Switch | 1.2.6 | Toggle function switches | Already in use, consistent with existing patterns |
| Radix UI Tabs | 1.1.13 | Generation mode selection tabs | Already in use, clean visual separation |
| Radix UI Select | 2.2.6 | Segmentation mode dropdown | Already in use, consistent with admin UI patterns |
| Pydantic BaseModel | (FastAPI built-in) | Request/response schemas | Already in codebase, extends existing lesson schemas |
| SQLAlchemy JSON | (ORM built-in) | Flexible config storage | No schema migration needed, backward compatible |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | No new frontend libraries needed | All UI primitives already available via Radix |

### Backend API Changes

| Change | Approach | Notes |
|--------|---------|-------|
| Add `generation_mode` to lesson schemas | Extend `LessonSubtitleVariantRequest` with enum: `english_materials` / `video_extraction` | Default to `english_materials` for backward compatibility |
| Add `segmentation_mode` to lesson schemas | Extend with enum: `sentence` / `paragraph` in video_extraction mode | Only shown when generation_mode = video_extraction |
| Update task creation endpoint | Accept new config fields in form data or JSON body | Supports both existing multipart/form and new JSON modes |
| Filter history by `generation_mode` | Add optional query param `?mode=english_materials\|video_extraction` | Distinguishes English learning vs video extraction records |
| Extend `LessonGenerationTask` model | Add `generation_mode` and `segmentation_mode` JSON fields | Stored in counters_json or as top-level fields |

### Database Schema Changes

| Table/Field | Change | Purpose |
|-------------|--------|---------|
| `lesson_generation_tasks.generation_mode` | Add `VARCHAR(32) DEFAULT 'english_materials'` | Distinguishes English materials generation vs video extraction |
| `lesson_generation_tasks.segmentation_mode` | Add `VARCHAR(32) DEFAULT 'sentence'` | Controls sentence vs paragraph segmentation |
| `lessons.generation_mode` | Optional `VARCHAR(32)` for completed lessons | Enables history filtering |

### Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|------------------------|
| JSON field for config | Separate tables for each mode | Over-engineering; modes share most processing pipeline |
| Boolean `semantic_split_enabled` | Enum `segmentation_mode` | Enum is more extensible for future modes (chunk, scene, etc.) |
| Same history table with mode filter | Separate tables per mode | Unnecessary complexity; mode is just a filter dimension |

### Sources

- Radix UI Dialog: https://www.radix-ui.com/primitives/docs/components/dialog
- Radix UI Switch: https://www.radix-ui.com/primitives/docs/components/switch
- Radix UI Select: https://www.radix-ui.com/primitives/docs/components/select
- Radix UI Tabs: https://www.radix-ui.com/primitives/docs/components/tabs
- Existing codebase patterns: `AnnouncementModal.jsx`, `TranslationDialog.jsx`
- Existing schemas: `app/schemas/lesson.py`, `app/models/lesson.py`
- Existing router: `app/api/routers/lessons.py`

---
*Stack research for: Import flow UX + video content extraction*
*Researched: 2026-04-02*
