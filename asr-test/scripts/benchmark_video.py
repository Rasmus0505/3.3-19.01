from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from asr_test_core import MODEL_SPECS, create_run, read_run_detail, transcribe_run, write_failure


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/benchmark_video.py <media_path>")
        return 1

    media_path = Path(sys.argv[1]).expanduser().resolve()
    if not media_path.exists():
        print(f"Missing media file: {media_path}")
        return 1

    summary: list[dict[str, object]] = []
    for model_key in MODEL_SPECS:
        print(f"Running {model_key} ...")
        context = create_run(source_path=media_path, model_key=model_key, original_name=media_path.name, copy_source=False)
        started = time.monotonic()
        try:
            transcribe_run(context)
            metrics = read_run_detail(context.run_id).get("metrics") or {}
            row = {
                "model_key": model_key,
                "status": "completed",
                "run_id": context.run_id,
                "audio_seconds": metrics.get("audio_seconds"),
                "elapsed_seconds": metrics.get("elapsed_seconds"),
                "rtf": metrics.get("rtf"),
                "segment_count": metrics.get("segment_count"),
            }
        except Exception as exc:
            write_failure(context, exc)
            row = {
                "model_key": model_key,
                "status": "failed",
                "run_id": context.run_id,
                "elapsed_seconds": round(time.monotonic() - started, 3),
                "error": str(exc),
            }
        summary.append(row)
        print(json.dumps(row, ensure_ascii=False))

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
