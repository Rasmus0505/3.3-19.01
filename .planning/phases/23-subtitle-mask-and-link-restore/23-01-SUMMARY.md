# Phase 23-01: 遮挡板居中 + 宽度自适应 — SUMMARY

**Completed:** 2026-04-03
**Plan:** 23-01 | Phase: 23-subtitle-mask-and-link-restore

## Tasks Completed

1. ✅ Task 1: Add lessonId change detection + centering reset
   - `prevLessonIdRef` + `sessionMaxWidthRatioRef` added (lines 1002-1003)
   - useEffect on `lesson?.id` triggers `buildDefaultTranslationMaskRect` centering (lines 1494-1507)

2. ✅ Task 2: Add sentence width expansion (only-upward)
   - `measureSubtitleWidth` callback measures subtitle text width (lines 1515-1529)
   - useEffect on `currentSentenceIndex` expands mask width only when larger (lines 1531-1547)
   - `sessionMaxWidthRatioRef` tracks max width within session

3. ✅ Task 3: Verify D-03 (read-only)
   - Confirmed: `enabled !== false` in useState reads from localStorage (line 926)
   - Confirmed: `buildTranslationMaskUiPreference` includes `enabled` field (line 155)
   - Confirmed: `persistTranslationMaskPreference` writes to localStorage (lines 1363-1374)
   - No code changes needed — D-03 already implemented

## Key Decisions

| Decision | Implementation |
|----------|----------------|
| D-01 (居中) | `buildDefaultTranslationMaskRect` on lessonId change |
| D-02 (只变宽) | `sessionMaxWidthRatioRef` tracking max, only `setState` when larger |
| D-03 (启用状态) | READ ONLY — already implemented by existing code |

## Files Modified

- `frontend/src/features/immersive/ImmersiveLessonPage.jsx`

## Verification

```bash
grep -n "prevLessonIdRef\|sessionMaxWidthRatioRef" frontend/src/features/immersive/ImmersiveLessonPage.jsx
grep -n "measureSubtitleWidth" frontend/src/features/immersive/ImmersiveLessonPage.jsx
grep -n "enabled !== false\|persistTranslationMaskPreference" frontend/src/features/immersive/ImmersiveLessonPage.jsx
```

## Commit

`23-01-PLAN.md` → commit for all 3 tasks

```
[main 2c81c4db] feat(23-01): add lessonId change detection and mask centering reset
```
