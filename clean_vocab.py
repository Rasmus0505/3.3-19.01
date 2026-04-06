"""
clean_vocab.py
从 cefr_vocab_fixed.json 中移除所有不标准缩写和口语错误拼写，
避免简单词被错误标记为高 CEFR 等级。

运行前会先显示计划删除的词及其影响，然后执行。
"""
import json
from pathlib import Path

VOCAB_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json")
BACKUP_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json.bak")
OUTPUT_PATH = VOCAB_PATH  # 直接覆盖

# ============================================================
# 第一类: JS _normalizeNonstandardContraction 已知映射表
# 这些词在词表里存在，会短路 JS 查询链的 Step1，
# 导致本该被还原到 A1 核心词的词被错误标记为 B2-C2/SUPER
# ============================================================
# 注意: JS 层只处理这些映射中的条目（vocabAnalyzer.js:_normalizeNonstandardContraction）。
# 如果一个词不在这个表里，删除后只能靠词形还原 / _stripContraction 还原。
# 所以 MISSING_NT 中的词删除后可能变成 SUPER（如 didnt, doesnt 等）。
# 修复: 在 JS 层也需要同步添加这些映射。
JS_NORMALIZE_MAP = {
    # word_in_vocab : correct_base_word  (这些是 JS 层已经处理的)
    "dont": "do",
    "cant": "can",
    "wont": "will",
    "shant": "shall",
    "im": "i",
    "ive": "i",
    "id": "i",
    "ill": "i",
    "theyve": "they",
    "theyll": "they",
    "theyd": "they",
    "weve": "we",
    "well": "we",
    "wed": "we",
    "youll": "you",
    "youd": "you",
    "its": "it",
    "thats": "that",
    "whats": "what",
    "whos": "who",
    "wheres": "where",
    "whens": "when",
    "hows": "how",
    "lets": "let",
}

# ============================================================
# 第二类: missing-apostrophe n't 模式（JS 层未处理）
# 删除后靠 _stripContraction 还原: didnt → did → do
# 但 JS _stripContraction 用正则匹配 n't，
# 所以 dont → do (直接)，didnt → ??? (strip 找不到 'nt -> )
# 实际上: didnt 没有 'nt 后缀，stripContraction 匹配不到。
# 只能在 normalize 映射里显式注册。
# ============================================================
# 完整的不标准缩写映射（用于 Python 分析；JS 层同步更新）
ALL_NORMALIZE = dict(JS_NORMALIZE_MAP)
ALL_NORMALIZE.update({
    # 不带撇号的 n't 缩写
    "didnt": "do",
    "doesnt": "do",
    "isnt": "is",
    "wasnt": "be",
    "arent": "be",
    "werent": "be",
    "havent": "have",
    "hasnt": "have",
    "hadnt": "have",
    "couldnt": "can",
    "wouldnt": "will",
    "shouldnt": "shall",
    "mustnt": "must",
    "mightnt": "might",
    "aint": "be",
    # 带撇号缩写去掉撇号
    "shes": "she",
    "hes": "he",
    "youre": "you",
    "theyre": "they",
    "youve": "you",
    "gonna": "go",
    "wanna": "want",
    "gotta": "get",
    "outta": "out",
    "kinda": "kind",
    "sorta": "sort",
    "lemme": "let",
    "gimme": "give",
    "dunno": "know",
    "shoulda": "should",
    "coulda": "could",
    "woulda": "would",
    "musta": "must",
    "ima": "i",
    # 网络俚语
    "u": "you",
    "ur": "your",
    "r": "are",
    "b": "be",
    "c": "see",
    "y": "why",
    "n": "and",
    "rn": "right",
    "yall": "you",
    # 其他
    "lotta": "lot",
    "asap": "as",
    "omg": "oh",
    "lol": "laugh",
    "lmao": "laugh",
    "ima": "i",
    "bruh": "brother",
    "smh": "shake",
    "ngl": "not",
    "ikr": "i",
    "ik": "i",
    "tbt": "throwback",
    "fomo": "fear",
    "yolo": "you",
    "v": "very",
    "btw": "by",
    "fyi": "for",
    "irl": "in",
    "idk": "know",
    "tbh": "to",
    "lmao": "laugh",
    "rn": "right",
})

# ============================================================
# 第二类: 遗漏的不标准缩写（穷举检测到但不在 JS 映射中）
# missing-apostrophe n't 模式: didnt/didn't → did
# ============================================================
MISSING_NT = {
    "didnt": "do",
    "doesnt": "do",
    "isnt": "is",
    "wasnt": "be",
    "arent": "be",
    "werent": "be",
    "havent": "have",
    "hasnt": "have",
    "hadnt": "have",
    "couldnt": "can",
    "wouldnt": "will",
    "shouldnt": "shall",
    "mustnt": "must",
    "mightnt": "might",
    "aint": "be",
}

# ============================================================
# 第三类: 口语/网络/拼写变体
# 这些词直接以高等级存在于词表，会短路词形还原链
# ============================================================
COLLOQUIAL_AND_SLANG = {
    # 带撇号缩写去掉撇号后的形式
    "shes": "she",
    "hes": "he",
    "youre": "you",
    "theyre": "they",
    "ima": "i",        # i'm going to → i
    "gonna": "go",     # going to → go (但有些词表把 gonna 标为 A1，下方逻辑会动态判断)
    "wanna": "want",
    "gotta": "get",
    "kinda": "kind",
    "sorta": "sort",
    "outta": "out",
    "dunno": "know",
    "lemme": "let",
    "gimme": "give",
    "shoulda": "should",
    "coulda": "could",
    "woulda": "would",
    "musta": "must",
    "youve": "you",
    "weve": "we",
    "theyve": "they",
    "theyd": "they",
    "theyll": "they",
    "youll": "you",
    "shant": "shall",
    "aint": "be",
    # 网络/短信俚语
    "u": "you",
    "ur": "your",
    "r": "are",
    "b": "be",
    "c": "see",
    "y": "why",
    "n": "and",
    "rn": "right",
    "omg": "oh",
    "lol": "laugh",
    "lmao": "laugh",
    "imo": "in",
    "idk": "know",
    "tbh": "to",
    "btw": "by",
    "fyi": "for",
    "asap": "as",
    "irl": "in",
    "yall": "you",
    "omg": "oh",
    "bruh": "brother",
    "smh": "shake",
    "ngl": "not",
    "ikr": "i",
    "tbt": "throwback",
    "fomo": "fear",
    "yolo": "you",
    "ik": "i",
    "ikr": "i",
    # 其他口语 blended forms
    "kinda": "kind",
    "sorta": "sort",
    "lotta": "lot",
    "outta": "out",
    "intas": "into",
    "dunno": "know",
    "lemme": "let",
    "gimme": "give",
    "supposedta": "supposed",
    "supposeta": "supposed",
    "gonna": "go",
    "wanna": "want",
    "gotta": "get",
    "hafta": "have",
    "musta": "must",
    "shoulda": "should",
    "coulda": "could",
    "woulda": "would",
    "ima": "i",
    "ima": "i",
    # 单字母
    "u": "you",
    "ur": "your",
    "r": "are",
    "b": "be",
    "c": "see",
    "y": "why",
    "n": "and",
    "v": "very",
}

# ============================================================
# 第四类: 其他词形还原时可能产生歧义的条目
# 如: hadnt → had (but had is irregular past of have)
# ============================================================
IRREGULAR_PAST_LEMMA = {
    # 不规则过去式/过去分词在词表中级别高于原形的情况
    # ran(A2) > run(A1), begun(B2) > begin(A1), written(B1) > write(A1)
    # 这些实际上不是"错误标记"，而是 COCA 词频的自然结果
    # (过去式词频往往比原形高)，所以不删除，只记录
}


def load_vocab():
    with open(VOCAB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def analyze_removal_candidates(words, all_removals, level_num):
    """分析每个待删除词：判断删除后的查询结果"""
    print(f"\n{'='*90}")
    print(f"DETAILED ANALYSIS: What happens after EACH word is removed")
    print(f"{'='*90}")
    print(f"\n{'Word':<15} {'Current':<8} {'Removes':<8} {'After (lookup chain)':<30} {'Fix?'}")
    print("-" * 90)

    # 词形还原规则（复现 JS 逻辑）
    suffix_rules = [
        ("ies", "y"), ("es", ""), ("ed", ""), ("ing", ""),
        ("ly", ""), ("ness", ""), ("ment", ""), ("tion", "t"), ("s", "")
    ]

    def lookup_after_removal(word, removed_set, word_map):
        """模拟删除后 lookupChain 的结果"""
        lower = word.lower()
        if lower in word_map and lower not in removed_set:
            return word_map[lower]["level"]

        # Step 2: lemmatize
        for suffix, replacement in suffix_rules:
            if lower.endswith(suffix) and len(lower) > len(suffix) + 2:
                base = lower[:-len(suffix)] + replacement
                if base in word_map and base not in removed_set:
                    return f"→ lemma:{base}→{word_map[base]['level']}"

        # Step 3: normalize nonstandard (full ALL_NORMALIZE map)
        if lower in ALL_NORMALIZE:
            mapped = ALL_NORMALIZE[lower]
            if mapped in word_map and mapped not in removed_set:
                return f"→ norm:{mapped}→{word_map[mapped]['level']}"

        # Step 4: strip contraction
        import re
        m = re.match(r"(.+?)n't$", lower)
        if m:
            base = m.group(1)
            special = {"wont": "will", "shant": "shall"}
            base = special.get(base, base)
            if base in word_map and base not in removed_set:
                return f"→ strip:'nt:{base}→{word_map[base]['level']}"

        m2 = re.match(r"(.+?)'(s|d|m|re|ve|ll)$", lower)
        if m2:
            base = m2.group(1).lower()
            if base in word_map and base not in removed_set:
                return f"→ strip:'s/d/m:{base}→{word_map[base]['level']}"

        return "→ not_found (SUPER)"

    changed = []
    for word in sorted(all_removals):
        if word not in words:
            continue
        current_level = words[word]["level"]
        current_num = level_num.get(current_level, 7)
        after = lookup_after_removal(word, all_removals, words)

        # 判断是否修复了问题
        # 修复 = 原来 B2+/SUPER，删除后变成 A1/A2 或 SUPER 但通过正确链
        fixed = current_num >= level_num["B2"] and ("→ A1" in after or "→ A2" in after or "→ lemma" in after or "→ norm" in after or "→ strip" in after)

        marker = "FIX" if fixed else "?"
        print(f"  {word:<13} {current_level:<8} →       {after:<30} {marker}")
        if fixed:
            changed.append(word)

    print(f"\n  → {len(changed)}/{len(all_removals)} words will be FIXED by removal")
    return changed


def main():
    data = load_vocab()
    words = data["words"]
    level_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    level_num = {l: i for i, l in enumerate(level_order)}
    level_num["SUPER"] = 7

    print(f"Loaded vocab: {len(words)} words")

    # 构建完整待删除集合
    all_removals = set()

    # 第一类: JS 已知映射中的条目（在词表中存在）
    cat1 = {w for w in JS_NORMALIZE_MAP if w in words}
    # 记录 JS 映射中不在词表里的条目（不需要删除，只是确认）
    cat1_missing = set(JS_NORMALIZE_MAP.keys()) - cat1
    if cat1_missing:
        print(f"\n[类别1b] JS normalize 映射条目（不在词表中, skip）: {sorted(cat1_missing)}")
    all_removals.update(cat1)
    print(f"\n[类别1] JS normalize 映射条目（在词表中）: {len(cat1)} 个")
    for w in sorted(cat1):
        print(f"  {w}: {words[w]['level']}")

    # 第二类: missing-apostrophe n't 模式
    cat2 = {w for w in MISSING_NT if w in words}
    all_removals.update(cat2)
    print(f"\n[类别2] missing-apostrophe n't 模式: {len(cat2)} 个")
    for w in sorted(cat2):
        print(f"  {w}: {words[w]['level']}  (should map to {MISSING_NT[w]})")

    # 第三类: 口语/网络俚语
    cat3 = {w for w in COLLOQUIAL_AND_SLANG if w in words}
    all_removals.update(cat3)
    print(f"\n[类别3] 口语/网络俚语变体: {len(cat3)} 个")
    for w in sorted(cat3):
        lvl = words[w]["level"]
        base = COLLOQUIAL_AND_SLANG[w]
        print(f"  {w}: {lvl:<8}  (should map to {base})")

    # 第四类: 扫描穷举更多 missing-apostrophe n't 模式
    # 动词原形 + nt (无撇号) 的形式
    import re
    cat4 = set()
    common_verbs = ["is", "are", "was", "were", "do", "does", "did", "have", "has",
                    "had", "will", "would", "could", "should", "can", "shall",
                    "must", "might", "need", "dare", "ought"]
    for verb in common_verbs:
        nt_form = verb + "nt"
        if nt_form in words and nt_form not in all_removals:
            cat4.add(nt_form)
            print(f"  [额外] missing-apostrophe: {nt_form}: {words[nt_form]['level']}  (base: {verb})")

    all_removals.update(cat4)

    # 扫描: 去掉 's/'d/'m/'re/'ve/'ll 后 base 存在于词表的缩写词
    print(f"\n[类别4] 带撇号缩写去掉撇号后 base 在词表中（直接短路词形还原）:")
    cat5 = set()
    for w in list(words.keys()):
        if "'" not in w or w.count("'") > 1:
            continue
        # 去掉撇号后缀
        for suffix in ["'s", "'d", "'m", "'re", "'ve", "'ll", "'t", "'ll"]:
            if w.lower().endswith(suffix):
                base = w[:-len(suffix)].lower()
                if base in words and len(base) >= 2:
                    # 如果 base 存在且是 A1-A2 核心词，且当前词等级更高，则删除
                    base_level_num = level_num.get(words[base].get("level", "SUPER"), 7)
                    w_level_num = level_num.get(words[w].get("level", "SUPER"), 7)
                    if w_level_num > base_level_num:
                        cat5.add(w)
                        print(f"  {w}: {words[w]['level']}  (base {base}: {words[base]['level']}) → SHADOWS BASE")
    all_removals.update(cat5)
    print(f"  共 {len(cat5)} 个")

    print(f"\n{'='*70}")
    print(f"TOTAL REMOVAL COUNT: {len(all_removals)} words")
    print(f"{'='*70}")

    # 分析删除后的效果
    changed = analyze_removal_candidates(words, all_removals, level_num)

    # 动态处理: 检查某些 A1 级别的口语词是否真的需要删除
    print(f"\n{'='*70}")
    print(f"A1-level colloquial words: decide individually")
    print(f"{'='*70}")
    a1_cats = [w for w in all_removals if w in words and words[w]["level"] == "A1"]
    print(f"\nA1-level words in removal list:")
    for w in sorted(a1_cats):
        base = COLLOQUIAL_AND_SLANG.get(w, JS_NORMALIZE_MAP.get(w, MISSING_NT.get(w, "")))
        base_lvl = words.get(base, {}).get("level", "N/A")
        print(f"  {w} (A1) → base '{base}' is {base_lvl}")
    print(f"\n  Decision: Keep A1-level entries that don't shadow a lower-level base")
    print(f"            Remove all B2+/SUPER entries regardless of colloquial status")

    # 最终决定: 删除所有 B2+/SUPER/C1 级别的条目
    # A1/A2 级别的条目：需要具体判断
    safe_keep = set()
    for w in list(all_removals):
        if w not in words:
            continue
        lvl = words[w]["level"]
        if lvl in ["A1", "A2"]:
            # A1/A2 级别：检查是否 shadow 了更低级别
            base = COLLOQUIAL_AND_SLANG.get(w) or JS_NORMALIZE_MAP.get(w) or MISSING_NT.get(w) or ""
            if base and base in words:
                base_lvl = words[base].get("level", "SUPER")
                base_num = level_num.get(base_lvl, 7)
                w_num = level_num.get(lvl, 7)
                if base_num <= w_num:
                    # base 级别 <= 当前级别：可以安全删除
                    pass
                else:
                    # base 是更低级别: 不删除（因为本级别不会造成错误高标记）
                    safe_keep.add(w)
                    all_removals.discard(w)
            else:
                # 没有明确的 base 映射: 如果是 A1 且没有明显问题，可以保留
                # 注意: 但如果这个词在 JS_NORMALIZE_MAP 里，必须删
                if lvl == "A1" and w not in JS_NORMALIZE_MAP:
                    safe_keep.add(w)
                    all_removals.discard(w)

    if safe_keep:
        print(f"\n  KEPT (A1/A2, no shadowing): {sorted(safe_keep)}")

    print(f"\n{'='*70}")
    print(f"FINAL REMOVAL LIST: {len(all_removals)} words")
    print(f"{'='*70}")
    for w in sorted(all_removals):
        print(f"  REMOVE: {w:<15} (was {words[w]['level']})")

    # ============================================================
    # 确认提示
    # ============================================================
    print(f"\n{'='*70}")
    print(f"DRY RUN COMPLETE — no files modified yet")
    print(f"Run with --execute flag to actually write changes")
    print(f"{'='*70}")

    if "--execute" in __import__("sys").argv:
        # 创建备份
        import shutil
        shutil.copy2(VOCAB_PATH, BACKUP_PATH)
        print(f"\nBackup created: {BACKUP_PATH}")

        # 删除所有需要移除的词
        for word in all_removals:
            if word in words:
                del words[word]

        # 写回
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

        print(f"Written: {OUTPUT_PATH}")
        print(f"Words removed: {len(all_removals)}")
        print(f"Remaining words: {len(words)}")

        # 验证关键查询
        print(f"\n{'='*70}")
        print(f"VERIFICATION: Simulated lookup after removal")
        print(f"{'='*70}")
        import re as re_mod
        suffix_rules = [
            ("ies", "y"), ("es", ""), ("ed", ""), ("ing", ""),
            ("ly", ""), ("ness", ""), ("ment", ""), ("tion", "t"), ("s", "")
        ]

        def verify_lookup(word, wmap):
            lower = word.lower()
            if lower in wmap:
                return f"direct:{wmap[lower]['level']}"
            for suffix, replacement in suffix_rules:
                if lower.endswith(suffix) and len(lower) > len(suffix) + 2:
                    base = lower[:-len(suffix)] + replacement
                    if base in wmap:
                        return f"lemma:{base}→{wmap[base]['level']}"
            if lower in ALL_NORMALIZE:
                mapped = ALL_NORMALIZE[lower]
                if mapped in wmap:
                    return f"norm:{mapped}→{wmap[mapped]['level']}"
            m = re_mod.match(r"(.+?)n't$", lower)
            if m:
                base = m.group(1)
                special = {"wont": "will", "shant": "shall"}
                base = special.get(base, base)
                if base in wmap:
                    return f"strip:'nt:{base}→{wmap[base]['level']}"
            m2 = re_mod.match(r"(.+?)'(s|d|m|re|ve|ll)$", lower)
            if m2:
                base = m2.group(1).lower()
                if base in wmap:
                    return f"strip:'s:{base}→{wmap[base]['level']}"
            return "SUPER/unknown"

        test_words = ["im", "cant", "dont", "wont", "say", "can", "do", "i",
                      "you", "shes", "hes", "lets", "thats", "whats", "wheres",
                      "hows", "theres", "heres", "youre", "theyre", "ima",
                      "gonna", "wanna", "gotta", "youve", "theyd", "theyll",
                      "didnt", "doesnt", "isnt", "wasnt", "havent", "couldnt",
                      "wouldnt", "shouldnt", "u", "ur", "omg", "lol", "yall"]
        print(f"\n{'Word':<15} {'After removal result':<35} {'Status'}")
        print("-" * 65)
        for tw in test_words:
            result = verify_lookup(tw, words)
            ok = "OK" if ("A1" in result or "A2" in result or "SUPER" in result and tw.lower() in ["lol","omg","ur"]) else "?"
            print(f"  {tw:<13} {result:<35} {ok}")
    else:
        print("\nDry run — use --execute to apply changes")


if __name__ == "__main__":
    main()
