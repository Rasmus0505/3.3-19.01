"""
clean_vocab_round2.py
第二轮清理：处理带撇号前缀碎片词和词形还原错误产物
"""
import json
from pathlib import Path

VOCAB_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json")
BACKUP_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json.bak")

def load_vocab():
    with open(VOCAB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    data = load_vocab()
    words = data["words"]
    keys = list(words.keys())

    to_remove = set()

    # ============================================================
    # 类别A: 带撇号前缀的碎片词（C1/C2/SUPER 级别）
    # ASR 输出常见: "'hello", "'world", "'she", "'they" 等
    # 这些是完整词前多了撇号，应该映射到对应词
    # ============================================================
    print("[A] 带撇号前缀碎片词 (C1/C2/SUPER 级别)")
    print("-" * 70)

    # 高等级撇号前缀碎片
    apostrophe_fragments = [
        # 核心 A1 词的前缀碎片（最常见）
        "'a", "'ah", "'al", "'am", "'an", "'and", "'as", "'at",
        "'be", "'been", "'but", "'by",
        "'can", "'cause", "'cos",
        "'do", "'don", "'did", "'day",
        "'em", "'en", "'er", "'ere", "'even", "'every", "'everything",
        "'first", "'for", "'fore", "'fraid", "'from",
        "'gimme",
        "'go", "'god", "'good",
        "'ha", "'had", "'have", "'he", "'her", "'here", "'hey", "'hi", "'his", "'how",
        "'i", "'if", "'ight", "'in", "'ing", "'is", "'it", "'just",
        "'know",
        "'let", "'like", "'love",
        "'me", "'more", "'my",
        "'n", "'na", "'nah", "'nd", "'ne", "'no", "'nor", "'not", "'nothing", "'now",
        "'of", "'oh", "'ok", "'on", "'once", "'one", "'only", "'or", "'other", "'our", "'out", "'over",
        "'people", "'please",
        "'re", "'right", "'round",
        "'s", "'see", "'she", "'since", "'so", "'sorry", "'sup",
        "'t", "'tell", "'th", "'thank", "'that", "'the", "'their", "'them", "'then", "'there", "'these", "'they", "'this", "'til", "'till", "'time", "'to", "'today", "'two",
        "'up", "'us",
        "'ve",
        "'we", "'well", "'what", "'when", "'where", "'which", "'while", "'who", "'why", "'will", "'with", "'would",
        "'yeah", "'yes", "'you", "'your",
        # 非英语片段
        "'bout",  # 'bout = about
        # 高频词
        "'about", "'after", "'again", "'all", "'also", "'always",
        "'back", "'because", "'before", "'being", "'between",
        "'come", "'could",
        "'even", "'everything", "'every",
        "'going", "'got", "'had", "'has", "'having", "'here", "'him", "'his",
        "'into", "'just",
        "'know", "'let", "'like", "'looking", "'look",
        "'made", "'make", "'many", "'more", "'most",
        "'much", "'must",
        "'need", "'never", "'now",
        "'oh", "'old", "'only", "'own",
        "'really", "'right",
        "'said", "'say", "'see", "'she", "'should", "'since", "'so", "'some", "'something", "'still", "'such",
        "'take", "'than", "'that", "'their", "'them", "'then", "'there", "'these", "'they", "'thing", "'this", "'those", "'through", "'time", "'to", "'today", "'too", "'turn', "'two',
        "'used", "'using",
        "'very",
        "'want", "'was", "'way", "'we", "'well", "'were", "'what", "'when", "'where", "'which", "'while", "'who", "'why", "'will", "'with", "'work", "'would",
        "'yes", "'yet", "'you", "'your",
    ]

    for w in apostrophe_fragments:
        if w in words:
            lvl = words[w]["level"]
            if lvl in ["SUPER", "C1", "C2"]:
                to_remove.add(w)
                print(f"  REMOVE: {w:<15} (level: {lvl})")

    # 扫描所有以撇号开头的 C1/C2/SUPER 词（自动发现遗漏的）
    print("\n[A2] 自动扫描撇号前缀 C1/C2/SUPER 词:")
    auto_apostrophe = [
        w for w in keys
        if w.startswith("'")
        and words[w]["level"] in ["SUPER", "C1", "C2"]
        and w not in to_remove
    ]
    print(f"  Found {len(auto_apostrophe)} additional apostrophe-prefixed words")
    for w in sorted(auto_apostrophe)[:30]:
        print(f"  AUTO: {w:<20} ({words[w]['level']})")
    if len(auto_apostrophe) > 30:
        print(f"  ... and {len(auto_apostrophe)-30} more")
    to_remove.update(auto_apostrophe)

    # ============================================================
    # 类别B: 词形还原错误产物（SUPER 级别但其有效衍生词是 A1/A2）
    # 比如: alway → always (A1) — 去掉 ly 后 base 存在但等级低于原词
    # 比如: someth → something (A1) — 去掉 ing 后 base 存在且等级低
    # 这些条目会干扰词形还原逻辑
    # ============================================================
    print("\n[B] 词形还原错误产物（SUPER 级）:")
    print("-" * 70)

    lemmatization_artifacts = [
        # 由 suffix stripping 产生的假词（去掉 -s/es/ed/ing/ly 后 base 存在但等级更高）
        # 这些 SUPER 级别的 base form 词会被 suffix stripping 误匹配
        "alway",    # always(A1) → alway(SUPER) — 去掉 ly
        "babi",     # babies(A1) → babi(SUPER) — 去掉 s
        "bodie",    # bodies(A1) → bodie(SUPER) — 去掉 s
        "cann",     # cannot(A1) → cann(SUPER) — 去掉 not
        "ches",     # choices(A1) → ches(SUPER) — 去掉 s
        "clothe",   # clothes(A1) → clothe(SUPER) — 去掉 s
        "discus",   # discuss(A1) → discus(SUPER) — 去掉 ing
        "jesu",     # jesus(A1) → jesu(SUPER) — 去掉 s
        "kidd",     # kids(A1) → kidd(SUPER) — 去掉 s
        "noth",     # nothing(A1) → noth(SUPER) — 去掉 ing
        "pleas",    # please(A1) → pleas(SUPER) — 去掉 e
        "someth",   # something(A1) → someth(SUPER) — 去掉 ing
        "trapp",    # trapped(A1) → trapp(SUPER) — 去掉 ed
        "wher",     # where(A1) → wher(SUPER) — 去掉 e (from wheres)
        # 其他可能干扰的短 SUPER 词
        "whee",     # whee(A2) — 感叹词，正常，保留
        "wee",      # wee(A2) — 感叹词，正常，保留
        "psst",     # psst(A2) — 感叹词，正常，保留
        "aw",       # aw(A2) — 感叹词，正常，保留
    ]

    for w in lemmatization_artifacts:
        if w in words:
            lvl = words[w]["level"]
            # 感叹词保留
            if w in ["whee", "wee", "psst", "aw"]:
                print(f"  KEEP (interjection): {w:<15} (level: {lvl})")
                continue
            to_remove.add(w)
            print(f"  REMOVE: {w:<15} (level: {lvl})")

    # 自动扫描: SUPER 级别短词(3-6字符) + 其加 s/ed/ing/es 形式是 A1/A2
    print("\n[B2] 自动扫描词形还原干扰词:")
    suffix_tests = [("s",""), ("es",""), ("ed",""), ("ing",""), ("ly","")]
    # 排除列表：虽然是词形还原产物但有合理英语含义，或不太可能出现在 ASR
    lem_keep = {
        "whee", "wee", "psst", "aw",  # 感叹词
        "putt",   # 高尔夫术语，有效词
        "pleas",  # 古英语 valid
        "trouser", # valid standalone (trouser cloth)
        "scissor", # valid standalone (verb)
        "pari",   # 印度语/拉丁语 valid
        "ches",   # 常见姓氏/地名
        "babi",   # 可能是名字
        "bodie",  # 可能是名字
    }
    auto_lems = []
    for w in keys:
        if words[w]["level"] != "SUPER":
            continue
        if w in lem_keep:
            continue
        if len(w) < 4 or len(w) > 7:
            continue
        # 跳过包含数字、连字符、撇号的词
        if any(c in w for c in "0123456789-'"):
            continue
        # 检查其衍生词是否在低等级
        for suffix, repl in suffix_tests:
            cand = w + suffix
            if cand in words and words[cand]["level"] in ["A1", "A2"]:
                auto_lems.append(w)
                print(f"  AUTO: {w:<15} → {cand} ({words[cand]['level']})")
                break
    to_remove.update(auto_lems)
    print(f"  Total auto lem artifacts: {len(auto_lems)}")

    # ============================================================
    # 类别C: 极短 SUPER 词（1-2字符），大多数是 ASR 噪声
    # ============================================================
    print("\n[C] 极短 SUPER 词（1-2字符）:")
    short_noise = [
        "a",  # 已经是 A1
        "b", "c", "d", "e", "f", "g", "h", "j", "k", "l", "m",
        "o",  # 单字母
        "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    ]
    for w in short_noise:
        if w in words and words[w]["level"] == "SUPER":
            # 单字母在词表中通常是 SUPER，但用户可能输入
            # 保留它们作为 SUPER（不标记为简单词）
            print(f"  KEEP (short, SUPER): {w}")

    # ============================================================
    # 汇总并执行
    # ============================================================
    to_remove = {w for w in to_remove if w in words}
    print(f"\n{'='*70}")
    print(f"ROUND 2 REMOVAL: {len(to_remove)} words")
    print(f"{'='*70}")
    for w in sorted(to_remove):
        print(f"  REMOVE: {w:<20} (was {words[w]['level']})")

    print(f"\n{'='*70}")
    print(f"DRY RUN — use --execute to apply")
    print(f"{'='*70}")

    if "--execute" in __import__("sys").argv:
        import shutil
        shutil.copy2(VOCAB_PATH, BACKUP_PATH)
        print(f"\nBackup: {BACKUP_PATH}")
        for w in to_remove:
            del words[w]
        with open(VOCAB_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"Written. Removed: {len(to_remove)}, Remaining: {len(words)}")

        # 验证
        print(f"\n{'='*70}")
        print("VERIFICATION")
        print(f"{'='*70}")
        tests = ["'say", "'the", "'but", "'you", "'what", "'where", "'how",
                 "'she", "'they", "'he", "'we", "'it", "'is", "'are",
                 "'have", "'be", "'do", "'can", "'will", "'go", "'get",
                 "wher", "someth", "noth", "cann", "alway"]
        for t in tests:
            lvl = words.get(t, {}).get("level", "NOT FOUND")
            print(f"  {t:<15}: {lvl}")
    else:
        print("\nDry run — use --execute")

if __name__ == "__main__":
    main()
