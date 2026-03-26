# Pitfalls Research

**Project:** Bottle English Learning
**Confidence:** MEDIUM

## Critical Pitfalls

1. **Server drift into media worker**
   - Warning signs: more server-side transcoding, large uploads stored centrally, long-running media jobs on web backend
   - Avoidance: keep local conversion on desktop where possible; use cloud-native ASR flows where browser support is enough

2. **Browser promises features it cannot deliver reliably**
   - Warning signs: browser-local ffmpeg experiments, unstable large-file handling, complicated permission workarounds
   - Avoidance: define web boundary clearly around browser-safe Bottle 2.0 flows

3. **Different generation paths produce inconsistent learning output**
   - Warning signs: Bottle 1.0 and Bottle 2.0 produce materially different lesson readiness or practice behavior
   - Avoidance: normalize outputs into one lesson/practice contract

4. **Billing and capability mismatch**
   - Warning signs: model pricing unclear, desktop-only features not reflected in product rules, point deduction happening inconsistently
   - Avoidance: keep admin-configurable rates and explicit capability gating tied to generation mode

5. **Non-technical users hit setup friction**
   - Warning signs: users need to manage models, keys, conversion tools, or unclear failure steps
   - Avoidance: automate installs/checks in desktop and keep web guidance simple and explicit
