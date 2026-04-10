# Phase 39: Multi-Modal Input Pipeline - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can bring any English material — webpage URL, PDF file, subtitle file (.srt/.vtt), or photo/screenshot — into the existing reading pipeline. The result of each input source is **extracted plain text** that feeds into the same diagnostic → pipeline → reading pack flow already built in Phase 35-36. This phase does NOT change the reading pipeline itself — it adds input adapters upstream of it.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User delegated all decisions to Claude with "你看着直接规划吧不用问我了". The following are Claude's recommended defaults based on codebase analysis, project constraints (light server, local-first), and requirements INPUT-01 through INPUT-04.

### Input Entry Point Design
- **D-01:** Extend the existing `LeftPanel.jsx` input mode with a **tab bar** above the textarea area. Tabs: "文本" (default, current textarea), "网页链接", "PDF", "字幕", "图片OCR". Each tab shows its own minimal input UI (URL field, file dropzone, etc.) while reusing the same submit-to-pipeline flow.
- **D-02:** All tabs converge to the same `onSubmit(text)` call that already triggers the diagnostic → pipeline flow. Each input adapter is responsible for extracting text and passing it to `onSubmit`. No changes needed to `ReadingPage.jsx` pipeline logic.
- **D-03:** Tab state is ephemeral (not persisted). Default tab is "文本" to preserve the current UX for returning users.

### Content Extraction Architecture
- **D-04:** **URL extraction — server-side.** Browser CORS prevents direct page fetching. Add a lightweight FastAPI endpoint (`POST /api/extract/url`) that fetches the page server-side using `httpx` + `readability` (Mozilla Readability algorithm via Python port like `readability-lxml` or `trafilatura`). Returns extracted article text. This is the only input source that requires server involvement — acceptable because it's a single HTTP fetch, not heavy processing.
- **D-05:** **PDF extraction — client-side.** Use `pdf.js` (Mozilla's PDF rendering library, already battle-tested) to extract text in the browser. No server upload needed. This aligns with the local-first constraint.
- **D-06:** **Subtitle parsing — client-side.** SRT and VTT are simple text formats. Parse in browser with a small utility (regex-based, no library needed). Strip timestamps, sequence numbers, and formatting tags. Join dialogue lines with paragraph breaks.
- **D-07:** **OCR — server-side.** Browser-based OCR (Tesseract.js) is too slow and inaccurate for Chinese learners photographing English textbooks. Use a lightweight server endpoint (`POST /api/extract/ocr`) that accepts an image upload and calls an external OCR API (DashScope OCR or similar cloud service already available in the project's infra layer). Returns extracted text.

### Subtitle Cleaning Rules
- **D-08:** Strip SRT sequence numbers and timestamps (`00:01:23,456 --> 00:01:25,789`). Strip VTT `WEBVTT` header, cue identifiers, and timestamps. Remove HTML-like tags (`<i>`, `<b>`, `<font>`). Remove speaker labels if present (e.g., `[Speaker 1]:`). Collapse multiple blank lines into single paragraph breaks.
- **D-09:** Preserve natural sentence boundaries where possible — if consecutive subtitle lines form a complete sentence (no period at line end), join them. If a line ends with `.`, `?`, `!`, treat as sentence boundary.

### Metadata Preservation (for History)
- **D-10:** Each input source sets a `sourceMetadata` object that gets stored alongside the reading pack in IndexedDB (extending the existing `readingRewriteDB.js` schema):
  - URL: `{ type: "url", sourceUrl: "https://...", title: "Page Title" }`
  - PDF: `{ type: "pdf", filename: "document.pdf", pageCount: N }`
  - Subtitle: `{ type: "subtitle", filename: "movie.srt", format: "srt" | "vtt" }`
  - OCR: `{ type: "ocr", filename: "photo.jpg" }`
  - Text (existing): `{ type: "text" }` (backward compatible default)
- **D-11:** The `HistoryPanel.jsx` should display a source label/icon based on `sourceMetadata.type` so users can identify materials in history. Small icon + text label (e.g., "🔗 网页", "📄 PDF", "🎬 字幕", "📷 OCR").

### Error & Boundary Handling
- **D-12:** URL extraction errors: show inline error below the URL field — "无法提取该网页内容，请检查链接是否正确" for network errors, "该网页内容过少，无法生成阅读包" if extracted text < 50 characters.
- **D-13:** PDF errors: show inline error — "无法解析该 PDF 文件" for corrupted files, "该 PDF 为扫描件，请使用图片 OCR 功能" if pdf.js extracts zero text (scanned PDF).
- **D-14:** Subtitle errors: show inline error — "无法解析字幕文件格式" if neither SRT nor VTT format detected.
- **D-15:** OCR errors: show inline error — "图片识别失败，请确保图片清晰且包含英文文字". Show a low-confidence warning if OCR returns text but confidence is low.
- **D-16:** File size limits: PDF max 10MB, image max 5MB, subtitle max 2MB. Enforce client-side before upload. Show "文件过大，请选择更小的文件" with specific limit.

### API Endpoints (Server-Side)
- **D-17:** `POST /api/extract/url` — accepts `{ url: string }`, returns `{ text: string, title: string }`. Rate-limited per user. Requires auth (JWT).
- **D-18:** `POST /api/extract/ocr` — accepts multipart form with image file, returns `{ text: string, confidence: float }`. Requires auth. Consumes user balance (OCR API cost). Show estimated cost before extraction.
- **D-19:** No server endpoint needed for PDF or subtitle — fully client-side.

### Cost Model
- **D-20:** URL extraction is free (negligible server cost — single HTTP fetch). PDF and subtitle are free (client-side). OCR consumes user balance because it calls an external paid API. Show "消耗 X 积分" confirmation before OCR extraction.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Multi-Modal Material Input — INPUT-01, INPUT-02, INPUT-03, INPUT-04 define acceptance criteria

### Existing Reading Pipeline (integration point)
- `frontend/src/features/reading/LeftPanel.jsx` — Current text-only input panel (to be extended with tabs)
- `frontend/src/features/reading/ReadingPage.jsx` — Pipeline orchestrator (diagnostic → pipeline → pack)
- `frontend/src/features/reading/readingRewriteDB.js` — IndexedDB storage for reading packs (schema extension needed for sourceMetadata)
- `frontend/src/features/reading/HistoryPanel.jsx` — History display (needs source label/icon)
- `frontend/src/features/reading/readingDiagnostics.js` — Diagnostic snapshot builder (text input interface)

### Backend Infrastructure
- `app/api/routers/` — Router patterns for new extract endpoints
- `app/infra/` — External service wrapper patterns (for OCR API wrapper)
- `app/services/` — Service layer patterns
- `app/core/config.py` — Environment config pattern for API keys

### Project Constraints
- `.planning/PROJECT.md` §Constraints — Light server, local-first processing, web delivery contract

### Prior Phase Context
- `.planning/phases/38-brand-rename/38-CONTEXT.md` — Brand is now "Unlock" (D-03: "Unlock 本地/云端" naming)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LeftPanel.jsx`: Already has `input` / `reading` mode pattern with `onSubmit(text)` — new tabs just need to call the same `onSubmit`
- `readingRewriteDB.js`: IndexedDB wrapper with `reading_rewrites_v3` store — extend schema for `sourceMetadata`
- `HistoryPanel.jsx`: History list with difficulty badges — add source icon/label column
- `app/infra/` layer: External API wrapper pattern (DashScope ASR, TTS, translation) — reuse for OCR API wrapper
- `frontend/src/shared/api/client.js`: API client with auth headers — use for new extract endpoints

### Established Patterns
- State management: Zustand stores + React local state (no Redux)
- Styling: TailwindCSS utilities + CSS custom properties
- File handling: No existing file upload UI in reading feature — upload feature (`UploadPanel.jsx`) has file input patterns that can be referenced
- API calls: `parseResponse()` helper from `client.js` for error handling
- Error display: `toast()` from `sonner` for transient errors, inline messages for form validation

### Integration Points
- `ReadingPage.jsx` calls `LeftPanel` with `onSubmit` — new input sources converge here
- `readingRewriteDB.js` `saveHistoryRecord()` — extend to include `sourceMetadata`
- Backend route registration in `app/main.py` — add new `extract` router
- `app/static/` sync required per Web Delivery Contract

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user delegated all decisions to Claude ("你看着直接规划吧不用问我了"). All decisions above are Claude's recommended defaults based on codebase analysis, project constraints, and INPUT-01~04 requirements.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 39-multi-modal-input-pipeline*
*Context gathered: 2026-04-10*
