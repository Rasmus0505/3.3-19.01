# Architecture Research

**Project:** Bottle English Learning
**Confidence:** HIGH for current structure

## Recommended Product Architecture

1. Shared account / wallet / lesson domain on the backend
2. Shared web + desktop renderer UI for most product flows
3. Desktop-only local helper bridge for local ASR, ffmpeg, yt-dlp, and URL import
4. Cloud generation path that both web and desktop can invoke
5. Unified lesson/practice pipeline after generation completes

## Data Flow Principle

- Input media should be prepared as close to the user device as possible.
- Cloud ASR should be used where device-local processing is not the chosen route.
- The backend should persist lesson/task/billing state and final learning artifacts, not act as the default heavy media worker.

## Build Order Implication

- Stabilize cloud generation path first because it is shared by web and desktop.
- Harden Bottle 1.0 desktop local path next.
- Add or refine desktop URL import after local runtime contracts are stable.
- Polish learning consistency and admin pricing after generation paths are reliable.
