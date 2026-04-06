"""
clean_vocab_punct.py
清理 cefr_vocab_fixed.json 中的四类污染词：
  1. 尾随标点词（. ,）
  2. 撇号前缀非缩写碎片
  3. 数字替代的 leetspeak（保留带连字符的数量词和序号词）
  4. 非字母开头的纯噪声词（- 和 . 开头的词）

用法:
  python clean_vocab_punct.py          # dry-run，仅打印计划删除的词
  python clean_vocab_punct.py --execute # 正式执行清理
"""

import json
import re
import shutil
from pathlib import Path

VOCAB_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json")
BACKUP_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json.bak")

# ============================================================
# 合法撇号缩写的白名单（保留这些，不删除）
# ============================================================
VALID_CONTRACTIONS = {
    "'t",  "'s",  "'re", "'ve", "'ll", "'d",  "'m",
    "'clock",  # 'clock = o'clock
    "'cause",  # 'cause = because (口语常用)
}


def load_vocab():
    with open(VOCAB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def is_trailing_punct(word: str) -> bool:
    """以 . 或 , 结尾"""
    stripped = word.rstrip(".,")
    return stripped != word and stripped.replace(".", "").replace(",", "") == stripped


def is_valid_contraction(word: str) -> bool:
    """撇号开头且是合法缩写"""
    if word.startswith("'") and len(word) > 1 and word[1:].isalpha():
        return word in VALID_CONTRACTIONS or len(word) == 2
    return False


def is_leetspeak(word: str) -> bool:
    """
    判断是否为字母词的数字替代（leetspeak）。
    规则：替换数字后还原为有效英文单词，且属于短词或明显是打字替代，
    而不是 ordinal（1st/2nd 等）、时间（10am）、年代（1920s）。
    """
    if "-" in word:
        return False  # 保留 10-year-old 等
    if not any(c.isdigit() for c in word):
        return False
    # 还原数字为字母（0→o, 1→i, 3→e, 4→a, 5→s, 7→l）
    table = {ord("0"): "o", ord("1"): "i", ord("3"): "e", ord("4"): "a", ord("5"): "s", ord("7"): "l"}
    alpha_version = word.translate(table)
    if not alpha_version.isalpha():
        return False
    # 跳过 ordinal / 时间 / 年代等合法词
    if re.match(r"^\d+(st|nd|rd|th)$", word):
        return False  # 1st, 2nd, 10th 等保留
    if re.match(r"^\d+[ap]m$", word, re.I):
        return False  # 10am, 2pm 等保留
    if re.match(r"^\d+s$", word):
        return False  # 1920s, 1980s 等保留
    # 短词且还原后是英文词：视为 leetspeak
    if len(word) <= 6:
        return True
    return False


def is_noise_start(word: str) -> bool:
    """以非字母字符开头（且不是撇号开头）"""
    if word.startswith("'"):
        return False  # 撇号前缀由类别2处理
    return not word[0].isalpha()


def is_junk_apostrophe(word: str) -> bool:
    """撇号不在开头，或者撇号开头但后面是非字母字符"""
    if word.startswith("'"):
        return False  # 撇号开头的由类别2处理
    if "'" in word and word.index("'") > 0:
        return True  # j' 等撇号在中间的
    return False


def main():
    data = load_vocab()
    words = data["words"]
    original_count = len(words)

    to_remove = set()
    reason = {}

    # ============================================================
    # 类别 1：尾随标点词
    # ============================================================
    print("[类别1] 尾随标点词 (. ,)")
    print("-" * 60)
    for w in sorted(words.keys()):
        if is_trailing_punct(w):
            to_remove.add(w)
            reason[w] = "尾随标点"
            print(f"  REMOVE: {w:<25} (level: {words[w]['level']})")

    # ============================================================
    # 类别 2：撇号前缀非缩写碎片
    # ============================================================
    print("\n[类别2] 撇号前缀非缩写碎片")
    print("-" * 60)
    for w in sorted(words.keys()):
        if w.startswith("'") and not is_valid_contraction(w):
            to_remove.add(w)
            reason[w] = "撇号前缀非缩写"
            print(f"  REMOVE: {w:<25} (level: {words[w]['level']})")

    # ============================================================
    # 类别 3：数字替代的 leetspeak
    # ============================================================
    print("\n[类别3] 数字替代 leetspeak")
    print("-" * 60)
    for w in sorted(words.keys()):
        if is_leetspeak(w):
            to_remove.add(w)
            reason[w] = "leetspeak"
            print(f"  REMOVE: {w:<25} (level: {words[w]['level']})")

    # ============================================================
    # 类别 4：非字母开头的纯噪声词
    # ============================================================
    print("\n[类别4] 非字母开头噪声词")
    print("-" * 60)
    for w in sorted(words.keys()):
        if is_noise_start(w):
            to_remove.add(w)
            reason[w] = "非字母开头"
            print(f"  REMOVE: {w:<25} (level: {words[w]['level']})")

    # ============================================================
    # 类别 5：撇号在中间的非标准词（如 j'）
    # ============================================================
    print("\n[类别5] 撇号在中间的词")
    print("-" * 60)
    for w in sorted(words.keys()):
        if is_junk_apostrophe(w):
            to_remove.add(w)
            reason[w] = "撇号在中间"
            print(f"  REMOVE: {w:<25} (level: {words[w]['level']})")

    # ============================================================
    # 最终过滤：确保都在词表中
    # ============================================================
    to_remove = {w for w in to_remove if w in words}
    removed_count = len(to_remove)
    remaining_count = original_count - removed_count

    print(f"\n{'=' * 60}")
    print(f"汇总：删除 {removed_count} 词，剩余 {remaining_count} 词")
    print(f"原词数: {original_count}")
    print(f"{'=' * 60}")

    print("\n按类别统计:")
    categories = {}
    for w in to_remove:
        r = reason.get(w, "unknown")
        categories.setdefault(r, []).append(w)
    for cat, ws in sorted(categories.items(), key=lambda x: -len(x[1])):
        print(f"  {cat}: {len(ws)} 词")

    if "--execute" in __import__("sys").argv:
        # 备份
        shutil.copy2(VOCAB_PATH, BACKUP_PATH)
        print(f"\n备份已保存: {BACKUP_PATH}")

        # 执行删除
        for w in to_remove:
            del words[w]

        # 写回
        with open(VOCAB_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"已写入: {VOCAB_PATH}")
        print(f"删除: {removed_count} 词")

        # 验证关键条目
        print(f"\n{'=' * 60}")
        print("验证关键条目")
        print(f"{'=' * 60}")
        tests = ["say.", "you.", "and.", "'all", "'i", "'you", "0f", "0n", "-and", ".i", "say", "you", "and"]
        for t in tests:
            lvl = words.get(t, {}).get("level", "NOT FOUND (已删除)")
            print(f"  {t:<15}: {lvl}")
    else:
        print("\n[DRY RUN] — 添加 --execute 参数以正式执行")


if __name__ == "__main__":
    main()