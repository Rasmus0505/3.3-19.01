"""
修正 cefr_vocab.json 中的 CEFR 等级。

策略：
  1. 优先使用权威参考词表（CEFR-J Vocabulary Profile）中的等级
  2. 参考词表未收录的词，保留原 rank-based 等级
  3. 输出修正报告和修正后的 JSON

用法：
  python fix_cefr_levels.py [--dry-run] [--output OUTPUT.json]
"""

import json
import csv
import argparse
from collections import defaultdict


def load_cefrj_reference(csv_path: str) -> dict[str, str]:
    """
    加载 CEFR-J 权威参考词表，返回 {word_lower: cefr_level} 字典。
    处理同一词多词性的情况，优先取最低（最简单）等级。
    """
    reference = {}  # word -> cefr level

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cefr = row["CEFR"].strip().upper()
            raw_headwords = row["headword"].strip()

            # CEFR-J 词表按难度排列（最左侧为主等级），取第一个匹配
            # 同一词可能在不同行出现，取最低（最简单）等级
            level_priority = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}

            # 处理 "/" 分隔的多个词形，如 "a.m./A.M./am/AM"
            for hw in raw_headwords.split("/"):
                hw = hw.strip().lower()
                if not hw:
                    continue
                if hw not in reference:
                    reference[hw] = cefr
                else:
                    # 如果已存在，取较简单的等级
                    existing_priority = level_priority.get(reference[hw], 99)
                    new_priority = level_priority.get(cefr, 99)
                    if new_priority < existing_priority:
                        reference[hw] = cefr

    return reference


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


def fix_cefr_levels(vocab_path: str, reference: dict[str, str], dry_run: bool = True) -> dict:
    """
    加载词表，修正等级，输出报告。
    """
    with open(vocab_path, encoding="utf-8") as f:
        vocab = json.load(f)

    words = vocab["words"]

    # 统计
    total = len(words)
    matched = 0          # 在权威词表中找到的词
    changed = 0          # 等级发生变化的词
    unchanged = 0       # 等级未变化的词
    new_levels = defaultdict(int)   # 新等级分布
    old_levels = defaultdict(int)   # 旧等级分布
    change_detail = []   # 详细变化列表

    level_priority = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6, "SUPER": 7, "UNKNOWN": 99}

    for word, info in words.items():
        old_level = info.get("level", "UNKNOWN")
        rank = info.get("rank", 0)
        original_rank_level = compute_rank_based_level(rank)

        if word.lower() in reference:
            matched += 1
            new_level = reference[word.lower()]

            # 如果原等级已是权威等级（可能和 rank-based 一致），无需改
            if old_level == new_level:
                unchanged += 1
            else:
                changed += 1
                change_detail.append({
                    "word": word,
                    "old": old_level,
                    "new": new_level,
                    "rank": rank,
                    "ref": "CEFR-J"
                })
                # 修正等级
                info["level"] = new_level
                info["_fixed"] = True
                info["_original_rank_level"] = original_rank_level
        else:
            # 权威词表未收录，保持原等级（已在词表中）
            # 标记一下来源
            info["_source"] = "rank-based"
            info["_original_rank_level"] = original_rank_level

        old_levels[old_level] += 1
        new_levels[info["level"]] += 1

    # 生成报告
    report = {
        "summary": {
            "total_words": total,
            "matched_in_reference": matched,
            "not_in_reference": total - matched,
            "levels_changed": changed,
            "levels_unchanged": unchanged,
            "changed_ratio": f"{changed}/{matched} ({changed/matched*100:.1f}%)" if matched else "N/A",
        },
        "level_distribution_before": dict(old_levels),
        "level_distribution_after": dict(new_levels),
        "changes_by_level": {
            "A1→升级": 0, "A2→升级": 0, "B1→升级": 0, "B2→升级": 0, "C1→升级": 0, "C2→升级": 0,
            "A1→降级": 0, "A2→降级": 0, "B1→降级": 0, "B2→降级": 0, "C1→降级": 0, "C2→降级": 0,
        },
        "top_changes": change_detail[:50],  # 只保留前50条详细展示
    }

    # 统计升降级
    for item in change_detail:
        old_p = level_priority.get(item["old"], 0)
        new_p = level_priority.get(item["new"], 0)
        if new_p < old_p:
            key = f"{item['old']}→降级"
            if key not in report["changes_by_level"]:
                report["changes_by_level"][key] = 0
            report["changes_by_level"][key] += 1
        elif new_p > old_p:
            key = f"{item['old']}→升级"
            if key not in report["changes_by_level"]:
                report["changes_by_level"][key] = 0
            report["changes_by_level"][key] += 1

    return vocab, report, change_detail


def main():
    parser = argparse.ArgumentParser(description="修正 cefr_vocab.json 的 CEFR 等级")
    parser.add_argument("--vocab", default="app/data/vocab/cefr_vocab.json",
                        help="词表 JSON 文件路径")
    parser.add_argument("--reference", default="cefrj-vocabulary-profile-1.5.csv",
                        help="权威参考词表 CSV 文件路径")
    parser.add_argument("--output", default="app/data/vocab/cefr_vocab_fixed.json",
                        help="输出文件路径（不含 --dry-run 时保存）")
    parser.add_argument("--dry-run", action="store_true", default=True,
                        help="仅生成报告，不保存文件")
    parser.add_argument("--save", action="store_false", dest="dry_run",
                        help="保存修正后的文件（覆盖 --dry-run）")
    args = parser.parse_args()

    vocab_path = args.vocab
    ref_path = args.reference

    print(f"加载权威参考词表: {ref_path}")
    reference = load_cefrj_reference(ref_path)
    print(f"  → 共加载 {len(reference)} 个词条\n")

    print(f"加载词表: {vocab_path}")
    vocab, report, changes = fix_cefr_levels(vocab_path, reference, dry_run=args.dry_run)
    print()

    # 打印报告
    s = report["summary"]
    print("=" * 60)
    print("  修正报告")
    print("=" * 60)
    print(f"  总词数:                   {s['total_words']:,}")
    print(f"  在权威词表中找到:         {s['matched_in_reference']:,}  ({s['matched_in_reference']/s['total_words']*100:.1f}%)")
    print(f"  未在权威词表中:           {s['not_in_reference']:,}")
    print(f"  等级发生变化:             {s['levels_changed']:,}")
    print(f"  等级未变化（已正确）:     {s['levels_unchanged']:,}")
    print(f"  变化比例:                 {s['changed_ratio']}")
    print()

    print("  等级分布变化（修正前 → 修正后）:")
    all_levels = sorted(set(list(report["level_distribution_before"]) + list(report["level_distribution_after"])))
    for lvl in all_levels:
        old = report["level_distribution_before"].get(lvl, 0)
        new = report["level_distribution_after"].get(lvl, 0)
        delta = new - old
        delta = new - old
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        print(f"    {lvl:6s}: {old:6,} → {new:6,}  ({delta_str.rjust(6)})")
    print()

    up_down = report["changes_by_level"]
    print("  升降级统计:")
    for key, val in up_down.items():
        if val > 0:
            print(f"    {key}: {val}")
    print()

    print("  修正幅度最大的词（前30条）:")
    # 按等级差异大小排序
    level_priority = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6, "SUPER": 7}
    sorted_changes = sorted(changes, key=lambda x: level_priority.get(x["new"], 99) - level_priority.get(x["old"], 0), reverse=True)
    for item in sorted_changes[:30]:
        delta = level_priority.get(item["new"], 99) - level_priority.get(item["old"], 0)
        arrow = "↓" if delta < 0 else "↑"
        print(f"    {item['word']:20s}  rank={item['rank']:>6}  {item['old']} → {item['new']}  ({arrow})")
    print()

    if not args.dry_run:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(vocab, f, ensure_ascii=False, indent=2)
        print(f"已保存修正后的词表至: {args.output}")
    else:
        print(f"[dry-run 模式] 如需保存，请加 --save 参数")
        print(f"  python {__file__} --save --output {args.output}")


if __name__ == "__main__":
    main()
