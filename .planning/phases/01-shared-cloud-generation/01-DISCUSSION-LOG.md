# Phase 1: Shared Cloud Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-Shared Cloud Generation
**Areas discussed:** Web media preparation path, runtime capability messaging, shared cloud task experience, supported inputs and file-size handling

---

## Web media preparation path

| Option | Description | Selected |
|--------|-------------|----------|
| Prefer cloud file path | Upload media to the cloud path used by Bottle 2.0 and avoid server-side transcoding by default | ✓ |
| Let server transcode as fallback | Use your own server when the web path cannot handle the media directly | |

**User's choice:** Prefer the cloud file path and do not let the server become the default transcoding fallback.
**Notes:** User explicitly wants low server pressure and is willing to recommend the desktop client instead of server-side fallback if the web/cloud path cannot reliably handle some media.

---

## Runtime capability messaging

| Option | Description | Selected |
|--------|-------------|----------|
| Popup + CTA | Show a clear popup for desktop-only features and include a download button | ✓ |
| Passive inline note | Only show a small page-level hint without a strong CTA | |

**User's choice:** Popup + CTA.
**Notes:** The CTA should sit at the bottom-right. If no final installer host exists yet, the product may temporarily direct users to a group number or manual distribution instructions.

---

## Shared cloud task experience

| Option | Description | Selected |
|--------|-------------|----------|
| Unified stages | Web and desktop should expose nearly the same Bottle 2.0 status stages and recovery expectations | ✓ |
| Runtime-specific flows | Let web and desktop present clearly different cloud-task experiences | |

**User's choice:** Unified stages.
**Notes:** User wants Bottle 2.0 to feel like one shared product flow even if implementation details differ underneath.

---

## Supported inputs and file-size handling

| Option | Description | Selected |
|--------|-------------|----------|
| Local uploads only for Phase 1 | Support local audio/video uploads now; keep link import for later phase | ✓ |
| Fold link import into Phase 1 | Include URL-based import in the initial shared cloud-generation phase | |
| Hard product cap now | Define a strict file-size limit immediately before validating actual cloud behavior | |
| Validate first, warn users, recommend desktop when needed | Use measured cloud constraints and guide users rather than guessing a low cap | ✓ |

**User's choice:** Local uploads only for Phase 1, support audio and video, and validate real file-size behavior before setting hard limits.
**Notes:** User does not want to explicitly state that link import is permanently unsupported; it is simply deferred to a later dedicated phase. Oversized or unreliable cases should point users to the desktop client.

---

## the agent's Discretion

- Exact popup copy and CTA hierarchy
- Exact status label wording for the shared Bottle 2.0 stages
- Exact warning thresholds after real-world cloud-file validation

## Deferred Ideas

- Desktop link import remains a later dedicated phase
- Permanent installer hosting/distribution path can be finalized later
- Final large-file limit policy should be based on measured cloud behavior rather than early guesses
