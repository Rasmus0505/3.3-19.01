#!/usr/bin/env python3
"""
CEFR Vocabulary Table Generator
================================
MIT License - 完全自主，无外部依赖

数据来源：vocabulary-list-statistics (MIT)
https://github.com/openderock/vocabulary-list-statistics
基于 349,066,176,882 词的语料库统计

CEFR 等级阈值（来源：vocabulary-level-grader 逻辑）：
    A1: rank <= 600
    A2: rank <= 1200
    B1: rank <= 2500
    B2: rank <= 5000
    C1: rank <= 10000
    C2: rank <= 20000
    超纲: rank > 20000

输出格式：
{
    "license": "MIT",
    "source": "COCA via vocabulary-list-statistics",
    "total_words": 50000,
    "meta": {
        "A1": {"min": 1, "max": 600, "description": "最基础词汇"},
        "A2": {"min": 601, "max": 1200, "description": "基础词汇"},
        ...
    },
    "words": {
        "the": {"rank": 1, "level": "A1"},
        "be": {"rank": 2, "level": "A1"},
        "quantum": {"rank": 9874, "level": "C1"},
        ...
    }
}
"""

import json
import os

# === 配置 ===
INPUT_FILE = "D:/3.3-19.01/package/data/en/en_2018_50k.txt"
OUTPUT_FILE = "D:/3.3-19.01/app/data/vocab/cefr_vocab.json"
MAX_RANK = 50000  # 取前50000个词

# CEFR 等级阈值（语言学标准）
CEFR_THRESHOLDS = [
    ("A1", 600),
    ("A2", 1200),
    ("B1", 2500),
    ("B2", 5000),
    ("C1", 10000),
    ("C2", 20000),
    ("SUPER", float("inf")),  # 超过 C2 的超纲词
]

def rank_to_level(rank: int) -> str:
    """根据词频排名返回 CEFR 等级"""
    for level, threshold in CEFR_THRESHOLDS:
        if rank <= threshold:
            return level
    return "SUPER"


def generate_vocab_table():
    """从原始数据生成 CEFR 词汇表"""
    words = {}
    stats = {level: 0 for level, _ in CEFR_THRESHOLDS}

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) < 2:
                continue

            word = parts[0].lower()
            try:
                count = int(parts[1])
            except ValueError:
                continue

            # rank 从 1 开始
            rank = len(words) + 1

            if rank > MAX_RANK:
                break

            level = rank_to_level(rank)
            words[word] = {
                "rank": rank,
                "level": level,
                "count": count
            }
            stats[level] += 1

    return words, stats


def main():
    print("开始生成 CEFR 词汇表...")
    print(f"输入文件: {INPUT_FILE}")
    print(f"最大词数: {MAX_RANK}")

    words, stats = generate_vocab_table()

    # 构建输出 JSON
    output = {
        "license": "MIT",
        "license_url": "https://opensource.org/licenses/MIT",
        "source": "COCA via vocabulary-list-statistics",
        "source_url": "https://github.com/openderock/vocabulary-list-statistics",
        "data_base": "349,066,176,882 词语料库统计",
        "generated_by": "cefr_vocab_generator.py",
        "total_words": len(words),
        "cefr_thresholds": {
            level: threshold for level, threshold in CEFR_THRESHOLDS if level != "SUPER"
        },
        "meta": {
            "A1": {"rank_min": 1, "rank_max": 600, "description": "最基础词汇，日常生活高频词"},
            "A2": {"rank_min": 601, "rank_max": 1200, "description": "基础词汇，简单交流够用"},
            "B1": {"rank_min": 1201, "rank_max": 2500, "description": "中级词汇，能处理日常话题"},
            "B2": {"rank_min": 2501, "rank_max": 5000, "description": "中高级词汇，能讨论抽象话题"},
            "C1": {"rank_min": 5001, "rank_max": 10000, "description": "高级词汇，学术/专业场景"},
            "C2": {"rank_min": 10001, "rank_max": 20000, "description": "精通级词汇接近母语者水平"},
            "SUPER": {"rank_min": 20001, "rank_max": 50000, "description": "超纲词，极罕见/专业术语"}
        },
        "stats": stats,
        "words": words
    }

    # 确保输出目录存在
    output_dir = os.path.dirname(OUTPUT_FILE)
    os.makedirs(output_dir, exist_ok=True)

    # 写入文件
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 生成完成！")
    print(f"输出文件: {OUTPUT_FILE}")
    print(f"总词数: {len(words):,}")
    print(f"\n各等级词数统计:")
    for level, count in stats.items():
        print(f"  {level}: {count:,} 词")

    # 计算文件大小
    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"\n文件大小: {file_size / 1024 / 1024:.2f} MB")
    print(f"gzip 压缩后预估: ~{int(file_size * 0.3 / 1024):} KB")


if __name__ == "__main__":
    main()
