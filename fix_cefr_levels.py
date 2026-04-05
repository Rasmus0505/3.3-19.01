"""
修正 cefr_vocab.json 中的 CEFR 等级，并保留完整词性（POS）信息。

策略：
  1. 优先使用权威参考词表（CEFR-J Vocabulary Profile）中的等级和词性
  2. 参考词表未收录的词，保留原 rank-based 等级
  3. 每个词保留所有词性条目（支持多词性）
  4. 输出修正报告和修正后的 JSON

新增词表结构（相对于旧版）：
  "run": {
    "rank": 42,
    "level": "A1",         ← 主等级：取最简单词性对应的等级（向后兼容）
    "count": 987654,
    "pos_entries": [       ← 新增：完整词性列表
      { "pos": "verb",   "level": "A2", "source": "CEFR-J" },
      { "pos": "noun",   "level": "B1", "source": "CEFR-J" }
    ]
  }
  "fall": {                ← 参考词表未收录的词
    "rank": 987,
    "level": "B1",         ← 保留原 rank-based 等级
    "count": 12345,
    "pos_entries": []
  }

用法：
  python fix_cefr_levels.py --dry-run        # 仅预览修正报告
  python fix_cefr_levels.py --save           # 正式生成修正后的 JSON
  python fix_cefr_levels.py --save --output 自定义路径.json
"""

import json
import csv
import argparse
from collections import defaultdict

# CEFR 等级优先级（数值越小越简单）
LEVEL_PRIORITY = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}


def load_cefrj_reference(csv_path: str) -> dict[str, list[dict]]:
    """
    加载 CEFR-J 权威参考词表，返回结构：
    {
        "word": [
            {"pos": "verb",   "level": "A2"},
            {"pos": "noun",   "level": "B1"},
        ],
        ...
    }

    处理逻辑：
      - 同一词多词性：每个词性单独一条条目，全部保留
      - 同一词形（"/" 分隔）：如 "a.m./A.M./am/AM"，每个形式都关联该词性
      - 同一词、同词性出现多次：取最简单等级
    """
    # 先按 (word, pos) 聚合，再统一
    entries_map: dict[str, dict[str, dict]] = defaultdict(dict)

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cefr = row["CEFR"].strip().upper()
            raw_headwords = row["headword"].strip()
            pos = row["pos"].strip()

            # 处理 "/" 分隔的多个词形，如 "a.m./A.M./am/AM"
            for hw in raw_headwords.split("/"):
                hw = hw.strip().lower()
                if not hw:
                    continue
                key = (hw, pos)
                if pos not in entries_map[hw]:
                    entries_map[hw][pos] = {"pos": pos, "level": cefr}
                else:
                    # 同一词 + 同一词性，取较简单的等级
                    existing_pri = LEVEL_PRIORITY.get(entries_map[hw][pos]["level"], 99)
                    new_pri = LEVEL_PRIORITY.get(cefr, 99)
                    if new_pri < existing_pri:
                        entries_map[hw][pos]["level"] = cefr

    # 转换为 {word: [pos_entry, ...]} 格式
    return {word: list(pos_dict.values()) for word, pos_dict in entries_map.items()}


def compute_rank_based_level(rank: int) -> str:
    """根据 rank 计算原 rank-based CEFR 等级。"""
    if rank <= 600:
        return "A1"
    elif rank <= 1200:
        return "A2"
    elif rank <= 2500:
        return "B1"
    elif rank <= 5000:
        return "B2"
    elif rank <= 10000:
        return "C1"
    elif rank <= 20000:
        return "C2"
    else:
        return "SUPER"


def _primary_level(pos_entries: list[dict]) -> str:
    """从 pos_entries 中取最简单（优先级最低）的等级作为主等级。"""
    if not pos_entries:
        return "UNKNOWN"
    return min(pos_entries, key=lambda e: LEVEL_PRIORITY.get(e["level"], 99))["level"]


def fix_cefr_levels(vocab_path: str, reference: dict[str, list[dict]], dry_run: bool = True) -> dict:
    """
    加载词表，修正等级，附加完整词性信息，输出报告。
    """
    with open(vocab_path, encoding="utf-8") as f:
        vocab = json.load(f)

    words = vocab["words"]

    # ── 统计变量 ────────────────────────────────────────────────
    total = len(words)
    matched = 0          # 在权威词表中找到的词
    changed = 0          # 等级发生变化的词
    unchanged = 0        # 等级未变化的词
    new_levels = defaultdict(int)
    old_levels = defaultdict(int)
    change_detail = []

    # 词性相关统计
    pos_distribution = defaultdict(int)          # 各词性出现次数
    words_with_pos = 0                          # 有权威词性标注的词数
    words_multi_pos = 0                         # 有多个词性的词数

    for word, info in words.items():
        old_level = info.get("level", "UNKNOWN")
        rank = info.get("rank", 0)
        original_rank_level = compute_rank_based_level(rank)

        word_lower = word.lower()
        if word_lower in reference:
            matched += 1
            pos_entries = reference[word_lower]
            new_primary = _primary_level(pos_entries)

            # 补全权威词性条目（每个条目加 source 标记）
            info["pos_entries"] = [
                {**entry, "source": "CEFR-J"} for entry in pos_entries
            ]

            # 统计词性
            for entry in pos_entries:
                pos_distribution[entry["pos"]] += 1
            if len(pos_entries) > 1:
                words_multi_pos += 1
            words_with_pos += 1

            # 修正等级
            if old_level == new_primary:
                unchanged += 1
                info["level"] = new_primary
                info["_fixed"] = False
            else:
                changed += 1
                change_detail.append({
                    "word": word,
                    "old": old_level,
                    "new": new_primary,
                    "rank": rank,
                    "ref": "CEFR-J",
                    "pos_entries": info["pos_entries"],
                })
                info["level"] = new_primary
                info["_fixed"] = True

            info["_original_rank_level"] = original_rank_level

        else:
            # 权威词表未收录，保持原等级，pos_entries 为空
            info["pos_entries"] = []
            info["_source"] = "rank-based"
            info["_original_rank_level"] = original_rank_level
            info["_fixed"] = False

        old_levels[old_level] += 1
        new_levels[info["level"]] += 1

    # ── 生成报告 ────────────────────────────────────────────────
    report = {
        "summary": {
            "total_words": total,
            "matched_in_reference": matched,
            "not_in_reference": total - matched,
            "levels_changed": changed,
            "levels_unchanged": unchanged,
            "changed_ratio": f"{changed}/{matched} ({changed/matched*100:.1f}%)" if matched else "N/A",
        },
        "pos_statistics": {
            "words_with_pos_entries": words_with_pos,
            "words_multi_pos": words_multi_pos,
            "pos_distribution": dict(sorted(pos_distribution.items(), key=lambda x: -x[1])),
        },
        "level_distribution_before": dict(old_levels),
        "level_distribution_after": dict(new_levels),
        "changes_by_level": {
            "A1→降级": 0, "A2→降级": 0, "B1→降级": 0, "B2→降级": 0, "C1→降级": 0, "C2→降级": 0,
            "A1→升级": 0, "A2→升级": 0, "B1→升级": 0, "B2→升级": 0, "C1→升级": 0, "C2→升级": 0,
        },
        "top_changes": change_detail[:50],
    }

    # 统计升降级
    for item in change_detail:
        old_p = LEVEL_PRIORITY.get(item["old"], 0)
        new_p = LEVEL_PRIORITY.get(item["new"], 0)
        if new_p < old_p:
            key = f"{item['old']}→降级"
        elif new_p > old_p:
            key = f"{item['old']}→升级"
        else:
            continue
        report["changes_by_level"][key] = report["changes_by_level"].get(key, 0) + 1

    return vocab, report, change_detail


def print_report(report: dict, changes: list[dict]):
    """打印格式化的修正报告。"""
    s = report["summary"]
    pos_stat = report["pos_statistics"]

    print("=" * 65)
    print("  CEFR 词表修正报告（含完整词性）")
    print("=" * 65)
    print(f"  总词数:                   {s['total_words']:,}")
    print(f"  在权威词表中找到:         {s['matched_in_reference']:,}  ({s['matched_in_reference']/s['total_words']*100:.1f}%)")
    print(f"  未在权威词表中:           {s['not_in_reference']:,}")
    print(f"  等级发生变化:             {s['levels_changed']:,}")
    print(f"  等级未变化（已正确）:     {s['levels_unchanged']:,}")
    print(f"  变化比例:                 {s['changed_ratio']}")
    print()

    print("  ── 词性统计 ─────────────────────────────────────")
    print(f"  有权威词性标注的词:       {pos_stat['words_with_pos_entries']:,}")
    print(f"  其中多词性词数:           {pos_stat['words_multi_pos']:,}")
    print()
    print(f"  {'词性':<22s}  {'词数':>8s}  {'占比':>8s}")
    print(f"  {'-'*40}")
    total_matched = s["matched_in_reference"]
    for pos, cnt in sorted(pos_stat["pos_distribution"].items(), key=lambda x: -x[1]):
        pct = cnt / total_matched * 100 if total_matched else 0
        print(f"  {pos:<22s}  {cnt:>8,}  {pct:>7.1f}%")
    print()

    print("  ── 等级分布变化（修正前 → 修正后） ─────────────")
    all_levels = sorted(
        set(list(report["level_distribution_before"]) + list(report["level_distribution_after"])),
        key=lambda x: LEVEL_PRIORITY.get(x, 99)
    )
    print(f"  {'等级':6s}  {'修正前':>8s}  {'修正后':>8s}  {'变化':>8s}")
    print(f"  {'-'*40}")
    for lvl in all_levels:
        old = report["level_distribution_before"].get(lvl, 0)
        new = report["level_distribution_after"].get(lvl, 0)
        delta = new - old
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        print(f"  {lvl:<6s}  {old:>8,}  {new:>8,}  {delta_str:>8s}")
    print()

    up_down = report["changes_by_level"]
    if any(v > 0 for v in up_down.values()):
        print("  升降级统计:")
        for key, val in up_down.items():
            if val > 0:
                print(f"    {key}: {val}")
        print()

    print("  修正幅度最大的词（前30条）:")
    sorted_changes = sorted(
        changes,
        key=lambda x: LEVEL_PRIORITY.get(x["new"], 99) - LEVEL_PRIORITY.get(x["old"], 0),
        reverse=True
    )
    print(f"  {'单词':<20s}  {'rank':>7s}  {'旧等级':>6s}  {'新等级':>6s}  {'词性'}")
    print(f"  {'-'*75}")
    for item in sorted_changes[:30]:
        delta = LEVEL_PRIORITY.get(item["new"], 99) - LEVEL_PRIORITY.get(item["old"], 0)
        arrow = "↓" if delta < 0 else "↑"
        pos_str = ", ".join(f"{e['pos']}({e['level']})" for e in item.get("pos_entries", []))
        print(f"  {item['word']:<20s}  {item['rank']:>7,}  {item['old']:>6s}  {item['new']:>6s}  {arrow}  {pos_str}")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="修正 cefr_vocab.json 的 CEFR 等级，并保留完整词性（POS）信息"
    )
    parser.add_argument(
        "--vocab",
        default="app/data/vocab/cefr_vocab.json",
        help="词表 JSON 文件路径"
    )
    parser.add_argument(
        "--reference",
        default="cefrj-vocabulary-profile-1.5.csv",
        help="权威参考词表 CSV 文件路径"
    )
    parser.add_argument(
        "--output",
        default="app/data/vocab/cefr_vocab_fixed.json",
        help="输出文件路径（不含 --save 时不写入）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="仅生成报告，不保存文件（默认）"
    )
    parser.add_argument(
        "--save",
        action="store_false",
        dest="dry_run",
        help="正式保存修正后的文件"
    )
    args = parser.parse_args()

    vocab_path = args.vocab
    ref_path = args.reference

    print(f"加载权威参考词表（CEFR-J）: {ref_path}")
    reference = load_cefrj_reference(ref_path)
    # 统计词性种类
    pos_types = set()
    total_pos_entries = 0
    for entries in reference.values():
        for e in entries:
            pos_types.add(e["pos"])
            total_pos_entries += 1
    print(f"  → 共 {len(reference):,} 个词条，{total_pos_entries:,} 条词性记录（{len(pos_types)} 种词性）\n")

    print(f"加载词表: {vocab_path}")
    vocab, report, changes = fix_cefr_levels(vocab_path, reference, dry_run=args.dry_run)
    print()

    print_report(report, changes)

    if not args.dry_run:
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(vocab, f, ensure_ascii=False, indent=2)
        print(f"已保存修正后的词表至: {args.output}")
    else:
        print(f"[ dry-run 模式 ] 如需保存，请加 --save 参数")
        print(f"  python {__file__} --save --output {args.output}")


if __name__ == "__main__":
    import os
    main()
