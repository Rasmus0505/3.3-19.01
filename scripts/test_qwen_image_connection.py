from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

import requests


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.image_generation_service import generate_image, get_default_image_generation_config


DEFAULT_PROMPT = "一只放在木桌上的红苹果，写实摄影风格，自然光，构图简洁。"


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test qwen-image-2.0-pro connectivity.")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--size", default="512*512")
    parser.add_argument("--skip-download", action="store_true")
    args = parser.parse_args()

    config = get_default_image_generation_config()
    config.size = args.size
    config.image_count = 1
    config.prompt_extend = False
    config.watermark = False
    config.seed = 7

    try:
        result = generate_image(args.prompt, config=config)
    except Exception as exc:
        print(f"[FAIL] qwen-image-2.0-pro request failed: {exc}")
        return 1

    if not result.images:
        print("[FAIL] qwen-image-2.0-pro returned no image URLs.")
        return 1

    image_url = result.images[0].url
    print(f"[OK] request_id={result.request_id or 'n/a'}")
    print(f"[OK] image_url={image_url}")
    print(f"[OK] size={result.width or 'unknown'}x{result.height or 'unknown'}")

    if args.skip_download:
        return 0

    try:
        response = requests.get(image_url, timeout=60)
        response.raise_for_status()
    except Exception as exc:
        print(f"[FAIL] image download check failed: {exc}")
        return 1

    suffix = ".png"
    with tempfile.NamedTemporaryFile(prefix="qwen-image-smoke-", suffix=suffix, delete=False) as tmp:
        tmp.write(response.content)
        tmp_path = Path(tmp.name)

    print(f"[OK] downloaded_image={tmp_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
