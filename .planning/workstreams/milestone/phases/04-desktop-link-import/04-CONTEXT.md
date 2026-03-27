# Phase 4: Desktop Link Import - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Let desktop users import supported media links through local tooling and feed the resulting media into the same canonical generation, history, and learning pipeline without pushing heavy download or conversion work onto the server. This phase covers desktop-only link ingestion, download/conversion safeguards, and integration with the existing lesson flow. It does not expand browser parity, add server-side media download workers, or change the canonical lesson model established in Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Entry surface
- **D-01:** Link import should live inside the existing upload/generation surface rather than a separate desktop-only page.
- **D-02:** The source selector should be always visible as a tab-style control in the upload area, with two explicit options: `本地文件` and `链接导入`.
- **D-03:** Web and desktop should both expose the same visible source-selection entry shape, but only desktop performs in-product link import.
- **D-03:** File upload and link import should converge back into the same generation pipeline once media is prepared locally.

### Local ingestion strategy
- **D-04:** Desktop link import should prioritize common public video page links rather than only direct media-file URLs.
- **D-05:** Link import should run through desktop-local tooling (`yt-dlp` plus local media preparation) rather than any server-mediated ingestion path.
- **D-06:** The system may support only links that the bundled local tooling can actually resolve reliably; unsupported links should fail clearly instead of pretending broader support.
- **D-07:** The import flow should accept only one link at a time in Phase 4; no batch link import.
- **D-08:** Before attempting import, the client should sanitize pasted link text by extracting and normalizing the actual URL, because copied short-video links may include surrounding Chinese text, punctuation, or other noise.
- **D-09:** If the pasted share text contains multiple fragments or multiple candidate URLs, the sanitizer should automatically keep the first recognized valid URL instead of asking the user to clean the text manually.
- **D-09:** After the user clicks `导入并生成课程`, the product should automatically run the full chain in one flow: sanitize link -> resolve/fetch video -> local media preparation -> lesson generation. Do not require extra confirmation or an additional manual trigger between those stages.
- **D-10:** Download, extraction, and conversion should happen before lesson generation starts, with explicit progress/cancel states visible in the shared upload flow.

### User-visible behavior
- **D-11:** Users should see one coherent desktop import flow: paste link -> local download/import progress -> generation progress -> history -> learn.
- **D-12:** Imported lessons should enter the same canonical history and learning flow as file-upload lessons; no separate link-import history section or badge should appear in the main learner flow.
- **D-13:** If link-derived metadata is available, it may improve default lesson title or source filename, but it must not create a second lesson identity beyond the canonical lesson record.
- **D-14:** If link-derived metadata is available, the default course title should use the parsed link title rather than a generic placeholder.
- **D-14:** The external fallback button to `https://snapany.com/zh` may be always visible on both desktop and web, but it is a secondary option and should not visually outrank the built-in primary flow.
- **D-15:** In the `链接导入` tab, the primary action button should read `导入并生成课程` so the user understands the flow leads directly into lesson generation rather than a separate import-only stage.
- **D-16:** The product should not require the user to inspect or confirm the cleaned URL before import. Link cleaning is automatic and should stay invisible unless an error occurs.
- **D-17:** Users should be allowed to edit the course title even while link import / generation is still in progress, not only after generation completes.
- **D-18:** If the user edits the title while link import / generation is still running, the new title should take effect immediately and become the final generated course title unless the user changes it again later.
- **D-19:** If the user switches from `链接导入` back to `本地文件` while a link task is actively downloading or preparing media, the product should show a confirmation dialog instead of silently continuing or silently canceling.
- **D-20:** That confirmation should let the user explicitly choose between `继续后台执行` and `取消当前链接任务`.
- **D-21:** When link import and lesson generation complete successfully, the default success behavior should be to enter the learning page directly rather than stopping on the upload page or first routing through history.

### Failure and recovery
- **D-22:** Link import failures should stay local-first: show download/import-specific failure messaging and retry/cancel options without falling back to server-side processing.
- **D-23:** Users should be able to cancel an in-flight link import and retry from the same shared upload surface.
- **D-24:** Link import should preserve the same no-source-exposure rule adopted in Phase 3 once a lesson has been created.
- **D-25:** Web should not pretend to do in-product link import; instead it may surface the same always-visible external fallback button to SnapAny.
- **D-26:** When a pasted link is unsupported or import fails, the product should not auto-jump away; instead it should show a clearer failure-state recommendation that explicitly points users to the always-visible SnapAny fallback as the next step.
- **D-27:** When no valid URL can be extracted from the pasted text, the error should read: `未识别到可导入链接。`
- **D-28:** The empty/invalid-link guidance should immediately offer two next-step hints:
  1. `请粘贴公开视频页链接，例如 YouTube/B站视频页链接`
  2. `改用 SnapAny`
- **D-29:** In these failure hints, `SnapAny` should be a clickable word that copies the fallback URL and then opens `https://snapany.com/zh`.
- **D-30:** If a link import fails after the user has already entered a link, the input should keep the original cleaned link value so the user can retry without re-pasting.
- **D-31:** If the pasted link appears to require login or is blocked by platform restrictions, the product should show a dedicated message such as `该链接可能需要登录或平台限制` and recommend SnapAny as the fallback path.
- **D-32:** Anywhere in the product where the word `SnapAny` appears, it should be clickable and perform the same fallback behavior: copy the URL and then attempt to open `https://snapany.com/zh`.

### the agent's Discretion
- Exact user-facing copy for unsupported-link, download-failed, and cancel/retry states
- Which link metadata fields are worth surfacing as default titles/source names
- The exact visual treatment of the always-visible external fallback button, as long as it remains secondary to the built-in flow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope and milestone framing
- `.planning/PROJECT.md` — Product runtime split, desktop-as-full-experience principle, and server-load constraint
- `.planning/workstreams/milestone/REQUIREMENTS.md` — `DESK-04` desktop users can import media from supported links through local tooling
- `.planning/workstreams/milestone/ROADMAP.md` — Phase 4 goal, dependency on Phase 3, and two-plan structure
- `.planning/workstreams/milestone/STATE.md` — Current milestone continuity after Phase 3 completion

### Prior phase decisions that constrain Phase 4
- `.planning/workstreams/milestone/phases/02-desktop-local-generation/02-CONTEXT.md` — Desktop helper/runtime ownership and invisible local-tooling principle
- `.planning/workstreams/milestone/phases/03-lesson-output-consistency/03-CONTEXT.md` — Canonical lesson/history/learning contract that imported media must feed into

### Desktop link-import and runtime integration points
- `frontend/src/features/upload/UploadPanel.jsx` — Existing desktop source mode, link-import phases, desktop runtime bridge use, and shared generation UI
- `desktop-client/electron/main.mjs` — Desktop runtime IPC handlers, local helper requests, file-selection/runtime integration
- `desktop-client/package.json` — `yt-dlp` packaging into desktop runtime resources
- `desktop-client/electron/helper-runtime.mjs` — Runtime tool resolution for packaged `yt-dlp`
- `app/infra/runtime_tools.py` — Local runtime resolution for `yt-dlp`
- `app/infra/media_ffmpeg.py` — ffmpeg/ffprobe media preparation expectations

### Contract coverage
- `tests/contracts/test_desktop_runtime_contract.py` — Desktop runtime bridge and packaged tool contract checks
- `tests/contracts/test_desktop_installer_contract.py` — Installer/resource assertions for `yt-dlp` packaging

### Supporting research note
- `.planning/research/SUMMARY.md` — Phase 4 rationale: URL import belongs to stable desktop runtime boundaries

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/upload/UploadPanel.jsx`: already contains a desktop source mode, link-importing phase state, cancel path, and desktop runtime bridge integration points
- `desktop-client/electron/main.mjs`: already exposes `requestLocalHelper`, `transcribeLocalMedia`, and local course generation IPC surfaces
- `desktop-client/package.json`: already packages `tools/yt-dlp` into desktop runtime resources
- `desktop-client/electron/helper-runtime.mjs`: already resolves packaged `yt-dlp` paths for the desktop runtime
- `app/infra/runtime_tools.py`: already centralizes runtime tool discovery for `yt-dlp`
- `app/infra/media_ffmpeg.py`: already centralizes local media preparation and ffmpeg expectations

### Established Patterns
- Desktop owns local-heavy capabilities; web explains the boundary instead of faking parity
- Upload and generation state already share one frontend surface with explicit phases and cancel/retry affordances
- Canonical lesson/history/learning flow is already unified from Phase 3 and should remain so

### Integration Points
- Link import should enter through `UploadPanel.jsx` desktop source mode, use desktop-local runtime/helper tooling, then hand back into the existing lesson generation pipeline
- Packaged `yt-dlp` and local ffmpeg prep should stay in desktop/runtime layers, not move into central backend orchestration
- Imported lesson results must reuse the same lesson/task/history contracts already normalized in Phase 3

</code_context>

<specifics>
## Specific Ideas

- The user-facing flow should feel like one extension of upload, not a separate import product.
- Desktop link import should be honest about support boundaries: only supported links should be accepted, and unsupported cases should fail clearly.
- Once the lesson exists, imported links should disappear into the same canonical learner flow as any other lesson.
- Users may paste noisy copied text around short-video URLs, so the product should sanitize and extract the real URL before validation/import.
- When pasted share text contains multiple fragments or multiple candidate URLs, the product should use the first valid URL automatically and continue.
- Default titles should come from parsed link metadata when available, not from a generic placeholder.
- Title editing should remain available during in-progress link import / generation so users can fix or shorten imported titles early.
- In-progress title edits should immediately become the source of truth for the final generated course title, not just a temporary frontend label.
- Switching tabs during an active link import should be treated as an interruption decision and require explicit user confirmation.
- On successful completion, link-import lessons should take the user directly into learning instead of pausing on an intermediate success screen.
- Failed imports should preserve the current link input so retry is low-friction.
- The SnapAny fallback should be visible without waiting for failure, but should still read as a lower-priority escape hatch rather than the main CTA.
- On unsupported-link failure, the UI should escalate SnapAny as the recommended next action, but it should not auto-open the external site.
- Clicking `导入并生成课程` should immediately start the whole pipeline; the user should not need to confirm the cleaned URL or trigger separate extraction/generation actions.
- Links that appear to require login or hit platform restrictions should get a more specific error than generic unsupported-link messaging, and that state should also recommend SnapAny.
- Every visible `SnapAny` word in this flow should behave consistently: click -> copy fallback URL -> attempt to open the site.
- When the pasted content contains no usable URL at all, the product should use the exact wording `未识别到可导入链接。` and then offer a concrete example hint plus a clickable `SnapAny` fallback that copies the URL and opens the site.

</specifics>

<deferred>
## Deferred Ideas

- Browser-side link import remains out of scope
- Broader provider expansion beyond what the packaged local tooling reliably supports belongs in later phases
- Any richer link-library, playlist, or batch-import product belongs in a future phase

</deferred>

---

*Phase: 04-desktop-link-import*
*Context gathered: 2026-03-27*
