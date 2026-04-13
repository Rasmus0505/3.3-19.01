from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.ocr_service import extract_text_from_image, get_default_ocr_config


DEFAULT_IMAGE_URL = "https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg"
DEFAULT_PROMPT = (
    "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。"
    "要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。"
    "返回数据格式以json方式输出。"
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test qwen-vl-ocr-latest connectivity.")
    parser.add_argument("--image", default=DEFAULT_IMAGE_URL)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--enable-rotate", action="store_true")
    args = parser.parse_args()

    config = get_default_ocr_config()
    config.prompt = args.prompt
    config.enable_rotate = args.enable_rotate

    try:
        result = extract_text_from_image(args.image, config=config)
    except Exception as exc:
        print(f"[FAIL] qwen-vl-ocr-latest request failed: {exc}")
        return 1

    print(f"[OK] request_id={result.request_id or 'n/a'}")
    print(f"[OK] prompt_tokens={result.prompt_tokens}")
    print(f"[OK] completion_tokens={result.completion_tokens}")
    print(f"[OK] total_tokens={result.total_tokens}")
    print(f"[OK] image_tokens={result.image_tokens}")
    print("[OK] text_preview=" + (result.text[:200].replace("\r", " ").replace("\n", "\\n") if result.text else "<empty>"))
    if result.structured_result:
        print(f"[OK] structured_keys={','.join(sorted(result.structured_result.keys()))}")
    if result.words_info:
        print(f"[OK] words_info_count={len(result.words_info)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
