---
phase: 39
plan: 01
subsystem: reading-pipeline
tags: [multi-modal, input, pdf, subtitle, ocr, url-extraction]
dependency_graph:
  requires:
    - "Phase 35-36: reading pipeline (LeftPanel + ReadingPage onSubmit interface)"
    - "Phase 32: readingRewriteDB IndexedDB schema"
    - "Phase 38: DashScope API infra"
  provides:
    - "Multi-modal input adapters (URL, PDF, subtitle, OCR) upstream of reading pipeline"
    - "sourceMetadata stored in history records"
    - "Source label display in HistoryPanel"
  affects:
    - "LeftPanel.jsx (input mode redesigned with tab bar)"
    - "HistoryPanel.jsx (sourceMetadata badge added)"
    - "ReadingPage.jsx (onSubmit extended with sourceMetadata param)"
tech_stack:
  added:
    - "pdfjs-dist@4.10.38 — client-side PDF text extraction"
    - "trafilatura>=1.6.0 — server-side webpage article extraction"
  patterns:
    - "Client-side file parsing: subtitleParser.js + pdfExtractor.js in inputAdapters/"
    - "Server-side content extraction: extract.py router with trafilatura + DashScope vision"
    - "All input sources converge to onSubmit(text, sourceMetadata) (D-02)"
key_files:
  created:
    - "frontend/src/features/reading/inputAdapters/subtitleParser.js"
    - "frontend/src/features/reading/inputAdapters/pdfExtractor.js"
    - "frontend/src/features/reading/api/extractApi.js"
    - "app/api/routers/extract.py"
    - ".planning/phases/39-multi-modal-input-pipeline/39-01-PLAN.md"
  modified:
    - "frontend/src/features/reading/LeftPanel.jsx"
    - "frontend/src/features/reading/HistoryPanel.jsx"
    - "frontend/src/features/reading/ReadingPage.jsx"
    - "frontend/src/features/reading/reading.css"
    - "app/main.py"
    - "requirements.txt"
    - "frontend/package.json"
    - "app/static/index.html"
decisions:
  - "Tab bar extends LeftPanel input mode above existing textarea (D-01)"
  - "All 5 tabs converge to same onSubmit(text, sourceMetadata) call (D-02)"
  - "Default tab = 文本 to preserve existing UX for returning users (D-03)"
  - "URL extraction is server-side (CORS), PDF/subtitle are client-side (D-04, D-05, D-06)"
  - "OCR is server-side DashScope qwen-vl-plus, consumes 10 fixed points per call (D-07, D-20)"
  - "sourceMetadata stored in history record, displayed as source label in HistoryPanel (D-10, D-11)"
  - "pdfjs-dist uses CDN worker URL to avoid bundling ~1MB worker into main chunk"
metrics:
  duration: "~45 minutes"
  completed: "2026-04-10"
  tasks: 5
  files: 8
---

# Phase 39 Plan 01: Multi-Modal Input Adapters Summary

Multi-modal input pipeline adapters: adds tab bar UI to LeftPanel with URL extraction (server-side trafilatura), client-side PDF (pdfjs-dist), client-side SRT/VTT subtitle parsing, and image OCR (DashScope qwen-vl-plus) — all converging to the same reading pipeline onSubmit flow.

## What Was Built

### Frontend: Tab Bar Input UI (LeftPanel.jsx)

Replaced the single-mode textarea input with a 5-tab bar:

- **文本** (default): existing textarea + Ctrl+Enter shortcut, unchanged behavior
- **网页链接**: URL input field + extract button, calls `/api/extract/url`
- **PDF**: file dropzone (.pdf max 10MB), client-side pdfjs-dist extraction
- **字幕**: file dropzone (.srt/.vtt max 2MB), client-side SRT/VTT parser
- **图片OCR**: image dropzone (max 5MB), calls `/api/extract/ocr`

All tabs call `onSubmit(text, sourceMetadata)` — extended from original `onSubmit(text)`.
Tab state is ephemeral (not persisted to localStorage). Default tab = "文本".

### Client-Side Input Adapters

**subtitleParser.js** (`inputAdapters/`):
- `detectFormat(content)` — auto-detects SRT vs VTT by content structure
- `parseSrt(content)` / `parseVtt(content)` — strips timestamps, sequence numbers, HTML tags, speaker labels
- `mergeDialogueLines(lines)` — D-09 sentence boundary detection: lines ending with `.?!` start new paragraph, others join with space
- `readSubtitleFile(file)` — File API wrapper with 2MB size check

**pdfExtractor.js** (`inputAdapters/`):
- `extractPdfText(file)` — lazy-imports pdfjs-dist, configures CDN worker, extracts text from all pages
- Scanned PDF detection: if extracted text < 50 chars, suggests using OCR tab
- 10MB file size limit enforced client-side before loading

### Frontend API Client (extractApi.js)

- `extractUrl(url, token)` — `POST /api/extract/url`, maps HTTP error codes to user-friendly Chinese messages
- `extractOcr(file, token)` — `POST /api/extract/ocr`, multipart form upload, 5MB client-side check before upload

### Backend: Content Extraction Router (extract.py)

**`POST /api/extract/url`** (free, no balance charge):
- Auth required (JWT)
- Uses `requests` to fetch the page with browser User-Agent
- Uses `trafilatura.extract()` for article content extraction (Mozilla Readability algorithm)
- Extracts `<title>` tag as article title with site-name suffix cleanup
- Error: 502 on network failure, 400 if extracted text < 50 chars, 503 if trafilatura not installed

**`POST /api/extract/ocr`** (paid: 10 points fixed):
- Auth required (JWT)
- Accepts multipart image upload (max 5MB, magic byte validation)
- Checks user balance before API call
- Calls DashScope `qwen-vl-plus` MultiModalConversation with English text extraction prompt
- Deducts 10 points after successful extraction
- Error: 402 on insufficient balance, 400 on no text found, 503 on DashScope failure

### History Integration (HistoryPanel + ReadingPage)

- `ReadingPage.handleArticleSubmit(text, sourceMetadata)` — extended to accept and save sourceMetadata in history record
- `saveHistoryRecord({ id, text, read_at, sourceMetadata })` — sourceMetadata stored alongside text
- `HistoryPanel.getSourceLabel(sourceMetadata)` — returns emoji+text label: "🔗 网页", "📄 PDF", "🎬 字幕", "📷 OCR"
- Source label shown as a small badge before status badges in history list

### Build & Static Sync

- pdfjs-dist auto-chunked to `pdf-gh-BrLFn.js` (~335KB, lazy loaded only when PDF tab used)
- `npm run build:app-static` completed successfully, `app/static/index.html` updated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Subtitles` icon not in lucide-react**
- **Found during:** Task 1 implementation
- **Issue:** `Subtitles` export does not exist in lucide-react@0.511.0
- **Fix:** Used `Captions` icon instead (same visual meaning, same library)
- **Files modified:** `frontend/src/features/reading/LeftPanel.jsx`

## Known Stubs

None — all 5 input tabs have functional implementations:
- Text tab: fully wired (unchanged)
- URL tab: wires to `/api/extract/url` — requires trafilatura installed on server
- PDF tab: client-side pdfjs-dist — functional
- Subtitle tab: client-side parser — functional
- OCR tab: wires to `/api/extract/ocr` — requires DASHSCOPE_API_KEY and qwen-vl-plus access

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ssrf | app/api/routers/extract.py | `/api/extract/url` fetches arbitrary user-supplied URLs server-side. Current mitigation: auth required, requests timeout=15s. No IP allowlist or private-range block implemented. |
| threat_flag: file-upload | app/api/routers/extract.py | `/api/extract/ocr` accepts image uploads. Validated by MIME prefix + magic bytes. Max 5MB enforced. No antivirus scanning. |

## Self-Check: PASSED

Files verified:
- FOUND: frontend/src/features/reading/inputAdapters/subtitleParser.js
- FOUND: frontend/src/features/reading/inputAdapters/pdfExtractor.js
- FOUND: frontend/src/features/reading/api/extractApi.js
- FOUND: app/api/routers/extract.py
- FOUND: app/static/index.html (updated)

Commits verified:
- FOUND: 67b1138 feat(39-01): add multi-modal input tab bar to LeftPanel
- FOUND: 03fb122 feat(39-01): add backend URL extraction and OCR endpoints
- FOUND: 54bb447 feat(39-01): register extract router and wire frontend integration
- FOUND: 8066a2b chore(39-01): install pdfjs-dist and sync app/static build
