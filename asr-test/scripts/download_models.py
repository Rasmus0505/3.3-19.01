from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from asr_test_core import MODEL_SPECS, download_all_models


def main() -> int:
    rows = download_all_models(force=False)
    for row in rows:
        print(f"{row['model_key']}: {MODEL_SPECS[row['model_key']]['repo_id']} -> {row['local_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
