from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.vision_service import analyze_image_with_qwen


DEFAULT_IMAGE_URL = "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"
DEFAULT_PROMPT = "请用一句中文描述图片主体。"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke test for qwen3-vl-flash image understanding.")
    parser.add_argument("--image-url", default=DEFAULT_IMAGE_URL, help="Public image URL used for the smoke test.")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt sent to qwen3-vl-flash.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not os.getenv("DASHSCOPE_API_KEY", "").strip():
        print(
            "DASHSCOPE_API_KEY 未设置。请先把 API key 加载到当前 shell 环境，再运行 smoke test。",
            file=sys.stderr,
        )
        return 2

    try:
        result = analyze_image_with_qwen(
            args.image_url,
            prompt=args.prompt,
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": type(exc).__name__,
                    "message": str(exc),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    print(
        json.dumps(
            {
                "ok": True,
                "provider": result.provider,
                "model": result.model,
                "request_id": result.request_id,
                "text": result.text,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
                "image_tokens": result.image_tokens,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
