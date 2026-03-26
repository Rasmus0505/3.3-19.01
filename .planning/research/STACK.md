# Stack Research

**Project:** Bottle English Learning
**Context:** Brownfield optimization of an existing FastAPI + React + Electron product
**Confidence:** HIGH for current codebase direction, MEDIUM for future tradeoffs

## Recommended Direction

- Keep the current split: FastAPI backend + shared React frontend + Electron desktop shell.
- Keep desktop as the full-capability runtime for local media tooling.
- Keep web focused on browser-safe cloud generation.
- Avoid large architectural rewrites unless they directly reduce server load or user friction.

## Core Technologies

- FastAPI + SQLAlchemy + Alembic for backend API, persistence, and operational controls
- React + Vite + Zustand for shared product UI
- Electron for desktop packaging and local-runtime bridging
- ffmpeg / ffprobe and yt-dlp on the desktop side for local media preparation and link import
- DashScope-based cloud ASR for Bottle 2.0
- faster-whisper local bundle for Bottle 1.0

## What Not To Do

- Do not move heavy media conversion into the central web server by default.
- Do not require end users to manage their own ASR keys.
- Do not chase full browser parity for local-tooling features that naturally belong in desktop runtime.

## Implication

The best path is product hardening and clearer runtime boundaries, not a rewrite.
