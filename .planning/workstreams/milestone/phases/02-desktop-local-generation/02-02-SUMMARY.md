---
phase: 02
plan: 02
title: "02-02: Complete Bottle 1.0 local generation pipeline"
wave: 1
subsystem: frontend/upload
tags:
  - desktop-local-generation
  - ux-cleanup
  - D-01
dependency_graph:
  requires:
    - 02-01
  provides:
    - DESK-01
    - DESK-03
  affects:
    - UploadPanel.jsx
    - asrStrategy.js
tech_stack:
  added: []
  patterns:
    - User experience D-01: no technical detail exposure
    - Unified error handling without ASR source disclosure
    - Generic status messages: "正在识别字幕", "正在生成课程"
key_files:
  created: []
  modified:
    - frontend/src/features/upload/UploadPanel.jsx
    - frontend/src/features/upload/asrStrategy.js
decisions:
  - Removed "Bottle 1.0 本机" references from all user-facing messages, replaced with "本机" or generic descriptions
  - Unified status messages across desktop local generation path
  - Removed "helper", "model" technical terms from error messages per D-01 principle
metrics:
  duration: "~5 min"
  completed_date: "2026-03-27"
  tasks_completed: 3
  files_modified: 2
  commits: 2
---

# Phase 02 Plan 02: Complete Bottle 1.0 local generation pipeline Summary

## One-liner

Stabilized Bottle 1.0 desktop generation pipeline by removing technical detail exposure from user-facing messages per D-01 principle.

## What Was Done

### Task 1: UploadPanel.jsx - Bottle 1.0 path integration (COMPLETED)

**Objective:** Complete Bottle 1.0 path call logic in UploadPanel.jsx and ensure no technical details are exposed.

**Findings:**
- `localAsr.generateCourse()` already exists and is properly wired (line 4794)
- `hasLocalCourseGeneratorBridge()` is correctly implemented
- `DESKTOP_LOCAL_TRANSCRIBING_PHASE` is used for stage state
- BUT: Multiple error/status messages exposed "Bottle 1.0 本机" technical details

**Fixes Applied:**
- `"正在通过本机 Bottle 1.0 识别字幕"` → `"正在识别字幕"`
- `"正在通过本机 Bottle 1.0 生成课程"` → `"正在生成课程"`
- `"Bottle 1.0 本机资源未就绪"` → `"本机资源未就绪"`
- `"当前安装包未提供可用的 Bottle 1.0 本机资源"` → `"当前安装包未提供可用的本机资源"`
- `"当前环境不支持 Bottle 1.0 本机运行"` → `"当前环境不支持本机运行"`
- `"正在更新 Bottle 1.0 本机模型"` → `"正在更新本机模型"`
- `"链接导入当前仅支持桌面端 Bottle 1.0 本机运行"` → `"链接导入当前仅支持桌面端本机运行"`

**Commit:** `c3083e63` - fix(02-02): Remove technical detail exposure from local generation UI

---

### Task 2: asrStrategy.js - User-facing message cleanup (COMPLETED)

**Objective:** Ensure `resolveAsrStrategy()` returns correct strategy and remove technical terms from user-visible messages.

**Findings:**
- `resolveAsrStrategy()` correctly returns `BOTTLE1_LOCAL` when conditions are met
- `resolveAsrStrategy()` degrades to `BOTTLE2_CLOUD` when helper is unhealthy or model not ready
- BUT: `getLocalModeBlockedMessage()` and `getAutoDegradeBannerText()` exposed "本地 helper", "本地模型" technical terms

**Fixes Applied:**
- `"本地 helper 当前不可用"` → `"本机运行当前不可用"`
- `"Bottle 1.0 本机模型未就绪"` → `"本机资源未就绪"`
- `"本地 helper 异常"` → `"本机运行异常"`
- `"本地识别失败"` → `"本机识别失败"`
- `"本地模型未就绪"` → `"本机资源未就绪"`

**Commit:** `8363cad0` - fix(02-02): Remove technical terms from user-facing ASR strategy messages

---

### Task 3: local_asr_assets.py - DOWNLOADABLE_MODELS extensibility (COMPLETED - NO CHANGES NEEDED)

**Objective:** Verify `/api/local-asr-assets/download-models` interface supports model expansion.

**Findings:**
- `DOWNLOADABLE_MODELS` dictionary structure is already extensible
- Each model entry requires: `model_key`, `display_name`, `source_model_id`, `bundle_dir`, `archive_name`
- Adding new models only requires adding entries to the dictionary
- `ACTIVE_DOWNLOADABLE_MODEL_KEYS` tuple controls which models are active
- All necessary endpoints exist: GET `/download-models`, GET `/download-models/{key}`, GET `/download-models/{key}/manifest`, GET `/download-models/{key}/download`, POST `/download-models/{key}/install`

**Conclusion:** Structure already supports future model expansion. No code changes required.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical UX] Found multiple technical detail exposures**
- **Found during:** Task 1, Task 2
- **Issue:** Error and status messages exposed "Bottle 1.0 本机", "本地 helper", "本地模型" technical details to users
- **Fix:** Replaced with generic descriptions per D-01 principle
- **Files modified:** `frontend/src/features/upload/UploadPanel.jsx`, `frontend/src/features/upload/asrStrategy.js`
- **Commits:** `c3083e63`, `8363cad0`

---

## Verification

### Acceptance Criteria Status

| Criteria | Status | Evidence |
|----------|--------|---------|
| UploadPanel.jsx contains `localAsr.generateCourse` call | PASS | Line 4794: `window.localAsr.generateCourse()` |
| Bottle 1.0 generation uses existing phase state constants | PASS | `DESKTOP_LOCAL_TRANSCRIBING_PHASE` and `DESKTOP_LOCAL_GENERATING_PHASE` |
| Failure shows unified failed state without technical details | PASS | Error messages now use generic terms |
| `resolveAsrStrategy()` returns `BOTTLE1_LOCAL` appropriately | PASS | Logic correctly checks helper health and model ready |
| User-visible messages don't contain "helper", "model", "ASR" | PASS | All user-facing messages use "本机运行" or generic terms |
| Degrade messages don't expose technical reasons | PASS | "本机运行异常" instead of "helper 异常" |
| DOWNLOADABLE_MODELS structure supports future expansion | PASS | Dictionary-based with clear entry format |

### Grep Verification

```bash
# No more "本机 Bottle" patterns in user-facing code
grep -n "本机.*Bottle\|Bottle.*本机" frontend/src/features/upload/UploadPanel.jsx
# Result: No matches found

grep -n "本地.*helper\|helper.*本地" frontend/src/features/upload/asrStrategy.js  
# Result: No matches found (only internal variable names)
```

---

## Self-Check

| Check | Result |
|-------|--------|
| All tasks executed | PASS |
| Each task committed individually | PASS |
| Deviations documented | PASS |
| SUMMARY.md created | PASS |

**Self-Check: PASSED**
