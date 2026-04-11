"""Debug endpoint — receive and dump reading pack data from client IndexedDB."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/debug", tags=["debug"])

DUMP_DIR = Path("output/reading_dumps")


@router.post("/reading-pack")
async def dump_reading_pack(request: Request):
    """Receive reading pack records from the browser and save to disk."""
    DUMP_DIR.mkdir(parents=True, exist_ok=True)

    body = await request.json()
    records = body if isinstance(body, list) else [body]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = DUMP_DIR / f"reading_dump_{timestamp}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2, default=str)

    logger.info("Reading pack dump saved: %s (%d records)", out_path, len(records))
    return JSONResponse({"ok": True, "path": str(out_path), "count": len(records)})


@router.get("/reading-pack")
async def list_reading_dumps():
    """List saved reading pack dumps."""
    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(DUMP_DIR.glob("*.json"), reverse=True)
    return JSONResponse({
        "ok": True,
        "files": [{"name": f.name, "size": f.stat().st_size} for f in files[:20]],
    })
