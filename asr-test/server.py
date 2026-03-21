from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from asr_test_core import ROOT_DIR, WEB_DIR, create_run, download_all_models, download_model, ensure_directories, list_runs, model_catalog, read_run_detail, transcribe_run, write_failure


app = FastAPI(title="ASR Test Lab")
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")
_ACTIVE_RUNS: dict[str, threading.Thread] = {}
_ACTIVE_RUNS_LOCK = threading.Lock()


def _start_background_run(context) -> None:
    def worker() -> None:
        try:
            transcribe_run(context)
        except Exception as exc:
            write_failure(context, exc)
        finally:
            with _ACTIVE_RUNS_LOCK:
                _ACTIVE_RUNS.pop(context.run_id, None)

    thread = threading.Thread(target=worker, name=f"asr-run-{context.run_id}", daemon=True)
    with _ACTIVE_RUNS_LOCK:
        _ACTIVE_RUNS[context.run_id] = thread
    thread.start()


def _run_artifact_path(run_id: str, name: str) -> Path:
    allowed = {"input.json", "progress.jsonl", "result.json", "metrics.json", "segments.json", "transcript.txt", "subtitle.srt"}
    if name not in allowed:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    path = ROOT_DIR / "runs" / run_id / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return path


@app.on_event("startup")
def on_startup() -> None:
    ensure_directories()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/asr-test/models")
def get_models() -> dict[str, object]:
    return {"ok": True, "items": model_catalog()}


@app.post("/api/asr-test/models/download")
def post_download_models(model_key: str | None = Form(default=None), force: bool = Form(default=False)) -> dict[str, object]:
    if model_key:
        path = download_model(model_key, force=force)
        return {"ok": True, "downloaded": [{"model_key": model_key, "local_path": str(path)}]}
    return {"ok": True, "downloaded": download_all_models(force=force)}


@app.get("/api/asr-test/runs")
def get_runs(limit: int = 50) -> dict[str, object]:
    return {"ok": True, "items": list_runs(limit=limit)}


@app.get("/api/asr-test/runs/{run_id}")
def get_run_detail(run_id: str) -> dict[str, object]:
    try:
        return {"ok": True, "item": read_run_detail(run_id)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Run not found.") from None


@app.get("/api/asr-test/runs/{run_id}/artifact/{name}")
def get_run_artifact(run_id: str, name: str) -> FileResponse:
    return FileResponse(_run_artifact_path(run_id, name), filename=name)


@app.post("/api/asr-test/upload-and-run")
async def upload_and_run(model_key: str = Form(...), media_file: UploadFile = File(...)) -> JSONResponse:
    if model_key not in {item["key"] for item in model_catalog()}:
        raise HTTPException(status_code=400, detail="Unknown model key.")
    temp_dir = ROOT_DIR / "tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_source = temp_dir / media_file.filename
    try:
        with temp_source.open("wb") as handle:
            while True:
                chunk = await media_file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        context = create_run(source_path=temp_source, model_key=model_key, original_name=media_file.filename, copy_source=True)
    finally:
        await media_file.close()
        if temp_source.exists():
            temp_source.unlink()
    _start_background_run(context)
    return JSONResponse({"ok": True, "run_id": context.run_id})


@app.get("/api/asr-test/runs/{run_id}/events")
async def stream_run_events(run_id: str) -> StreamingResponse:
    progress_path = ROOT_DIR / "runs" / run_id / "progress.jsonl"
    if not progress_path.parent.exists():
        raise HTTPException(status_code=404, detail="Run not found.")

    async def event_generator():
        offset = 0
        terminal = False
        while True:
            if progress_path.exists():
                with progress_path.open("r", encoding="utf-8") as handle:
                    handle.seek(offset)
                    chunk = handle.read()
                    offset = handle.tell()
                if chunk:
                    for line in chunk.splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            payload = json.loads(line)
                        except Exception:
                            continue
                        if payload.get("event_type") in {"completed", "failed"}:
                            terminal = True
                        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            if terminal:
                break
            yield "event: ping\ndata: {}\n\n"
            await asyncio.sleep(0.75)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
