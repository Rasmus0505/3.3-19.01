"""
fix_vocab_analysis.py
全面扫描 cefr_vocab_fixed.json，挖掘所有会导致简单词被错误标记为高 CEFR 等级的问题条目。
"""
import json
import sys
import re
from pathlib import Path

VOCAB_PATH = Path("d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json")
OUTPUT_PATH = Path("d:/3.3-19.01/vocab_problematic_words.txt")

# ============================================================
# JS 已知 normalizeNonstandardContraction 映射
# ============================================================
KNOWN_NORMALIZE = {
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
# 所有已知缩写形式的完整枚举（用于穷举检测）
# ============================================================
def build_contraction_variants():
    """穷举所有可能的不标准缩写形式"""
    bases = ["i", "you", "he", "she", "it", "we", "they", "that", "what", "who",
             "where", "when", "how", "this", "there", "here", "let", "will",
             "can", "do", "shall", "would", "could", "should", "may", "might",
             "must", "is", "are", "was", "were", "have", "has", "had"]
    suffixes = {
        "n't": "t",
        "'t": "t",
        "'s": "s",
        "'d": "d",
        "'m": "m",
        "'re": "re",
        "'ve": "ve",
        "'ll": "ll",
    }
    results = {}
    for base in bases:
        for suffix_full, suffix_short in suffixes.items():
            # 不带撇号的缩写形式
            separated = base + suffix_short
            # 带撇号的正确形式
            proper = base + suffix_full
            results[separated.lower()] = (proper.lower(), base.lower())
    return results

# 构建词形还原不规则映射
IRREGULAR_LEMMAS = {
    "ran": "run", "won": "win", "begun": "begin", "written": "write",
    "taken": "take", "given": "give", "seen": "see", "been": "be",
    "gone": "go", "come": "come", "made": "make", "known": "know",
    "thought": "think", "told": "tell", "found": "find", "said": "say",
    "got": "get",
}

# A1/A2 核心词汇（词表应该包含且正确标记的）
CORE_A1 = {
    "i", "a", "an", "the", "is", "it", "to", "of", "and", "or", "but", "in",
    "on", "at", "by", "for", "with", "as", "be", "am", "are", "was", "were",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "can", "shall", "need", "want",
    "go", "goes", "went", "gone", "come", "comes", "came", "make", "makes",
    "made", "get", "gets", "got", "take", "takes", "took", "know", "knows",
    "knew", "think", "thinks", "thought", "see", "sees", "saw", "say",
    "says", "said", "tell", "tells", "told", "find", "finds", "found",
    "give", "gives", "gave", "use", "uses", "used", "put", "puts",
    "keep", "keeps", "kept", "let", "lets", "begin", "begins", "began",
    "seem", "seems", "seemed", "help", "helps", "helped", "show", "shows",
    "hear", "hears", "heard", "play", "plays", "played", "run", "runs",
    "move", "moves", "moved", "live", "lives", "lived", "believe",
    "believes", "hold", "holds", "brings", "happen", "write", "writes",
    "provide", "sits", "stand", "lose", "pay", "meet", "include",
    "continue", "set", "learn", "change", "lead", "understand",
    "watch", "follow", "stop", "create", "speak", "read", "spend",
    "grow", "open", "walk", "win", "offer", "remember", "love",
    "consider", "appear", "buy", "wait", "serve", "die", "send",
    "expect", "build", "stay", "fall", "cut", "reach", "kill", "remain",
    "suggest", "raise", "pass", "sell", "require", "report", "decide",
    "pull", "you", "me", "my", "your", "he", "him", "his", "she", "her",
    "they", "them", "their", "we", "our", "us", "its", "this", "that",
    "what", "which", "who", "whom", "when", "where", "why", "how",
    "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "no", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "now", "then", "here", "there", "up", "down",
    "out", "if", "about", "because", "any", "into", "through", "during",
    "before", "after", "above", "below", "between", "under", "again",
    "further", "once", "yes", "no", "yes", "please", "hello", "good",
    "bad", "big", "small", "new", "old", "young", "long", "short",
    "high", "low", "right", "left", "first", "last", "next", "way",
    "thing", "people", "time", "year", "day", "man", "woman", "child",
    "children", "world", "life", "hand", "part", "place", "case",
    "week", "company", "system", "program", "question", "work",
    "government", "number", "night", "point", "home", "water", "room",
    "mother", "area", "money", "story", "fact", "month", "lot", "study",
    "book", "eye", "job", "word", "business", "issue", "side", "kind",
    "head", "house", "service", "friend", "father", "power", "hour",
    "game", "line", "end", "member", "law", "car", "city", "name",
    "national", "student", "paper", "party", "result", "group", "new",
    "problem", "state", "student", "process", "student", "back", "only",
    "name", "really", "never", "always", "something", "around", "another",
    "everything", "trying", "school", "turn", "started", "running",
    "getting", "making", "know", "thinking", "putting",
}

def levenshtein(s1, s2):
    if len(s1) < len(s2): return levenshtein(s2, s1)
    if len(s2) == 0: return len(s1)
    prev = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (c1 != c2)))
        prev = curr
    return prev[-1]

def load_vocab():
    with open(VOCAB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    print("=" * 80)
    print("CEFR VOCABULARY COMPREHENSIVE ANALYSIS")
    print("=" * 80)

    data = load_vocab()
    words = data["words"]
    word_list = list(words.keys())
    word_set = set(word_list)

    level_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    level_num = {l: i for i, l in enumerate(level_order)}
    level_num["SUPER"] = 7

    results = []
    contractions = build_contraction_variants()

    # ============================================================
    # 类别1: 已知的 JS 规范化映射中的不标准缩写
    # ============================================================
    print("\n[类别1] 已知的 JS normalizeNonstandardContraction 中的条目:")
    print("-" * 70)

    known_problematic = []
    for word, mapped_to in KNOWN_NORMALIZE.items():
        if word in word_set:
            word_level_num = level_num.get(words[word]["level"], 7)
            if word in word_set:
                base_level_num = level_num.get(words.get(mapped_to, {}).get("level", ""), -1)
            else:
                base_level_num = -1
            severity = "HIGH"
            known_problematic.append({
                "word": word,
                "level": words[word]["level"],
                "should_be": words.get(mapped_to, {}).get("level", "A1 (estimated)"),
                "maps_to": mapped_to,
                "severity": severity,
            })
            print(f"  {word:15} -> {words[word]['level']:5} (maps to '{mapped_to}')")

    # ============================================================
    # 类别2: 通过正则穷举所有不标准缩写
    # ============================================================
    print("\n[类别2] 穷举所有不标准缩写形式 (不在 normalize 映射中):")
    print("-" * 70)

    all_contraction_words = set(KNOWN_NORMALIZE.keys())

    # 也包括 JS _stripContraction 能处理的 pattern (n't 结尾)
    ntp = re.compile(r"(.+?)n't$", re.IGNORECASE)
    apostrophe_forms = re.compile(r"(.+?)'(s|d|m|re|ve|ll)$", re.IGNORECASE)

    additional_contractions = []
    for w in word_list:
        w_lower = w.lower()
        # 跳过已经知道的
        if w_lower in all_contraction_words:
            continue
        # 跳过带撇号的正确形式
        if "'" in w:
            continue
        # 检查 n't 模式
        m = ntp.match(w_lower)
        if m:
            base = m.group(1)
            # 如果 base 在核心词汇里，这是一个不标准缩写
            if base in CORE_A1 or base in word_set:
                all_contraction_words.add(w_lower)
                additional_contractions.append(w_lower)
                print(f"  n't pattern: {w:20} (base='{base}')")
                continue

        # 检查带撇号缩写去掉撇号后的形式 (weren -> were+n't)
        # 比如 werent (should be weren't/weren't)
        m2 = re.match(r"(.+?)nt$", w_lower)
        if m2:
            base = m2.group(1)
            # 检查 base 是否存在于词表且是常见动词
            if base in CORE_A1 or (base in word_set and words.get(base, {}).get("level", "SUPER") in ["A1", "A2", "B1"]):
                # 检查去掉 'nt' 后 base 是不是真的动词
                # is + nt = isnt (正确是 isn't)
                if base in ["is", "are", "was", "were", "do", "does", "did",
                            "have", "has", "had", "will", "would", "could",
                            "should", "can", "shall", "must", "might"]:
                    all_contraction_words.add(w_lower)
                    additional_contractions.append(w_lower)
                    print(f"  missing-apostrophe n't: {w:20} (base='{base}')")

    # ============================================================
    # 类别3: 查找同一词的不同变体（可能互相冲突）
    # ============================================================
    print("\n[类别3] 同一词的不同变体冲突检测:")
    print("-" * 70)

    # 比如 dont vs don't, cant vs can't
    variants_conflicts = []
    for w in word_list:
        if "'" not in w:
            # 检查对应的带撇号形式
            # dont -> don't, cant -> can't, wont -> won't, etc.
            w_lower = w.lower()
            # 不标准缩写
            base_contraction = None
            # n't 结尾
            m = re.match(r"(.+?)nt$", w_lower)
            if m:
                base = m.group(1)
                # dont -> don't, cant -> can't
                with_apostrophe = base + "n't"
            else:
                # im -> i'm, id -> i'd, ive -> i've, etc.
                # 这些词以 m/ve/re/ll/d 结尾但不是 n't
                if w_lower.endswith(("m", "ve", "re", "ll", "d")) and len(w_lower) >= 2:
                    # 尝试匹配不同的缩写形式
                    pass
            # 检查词表里是否同时有 dont 和 don't
            if w_lower in word_set:
                # 尝试各种撇号形式
                candidates = []
                # n't
                candidates.append(w_lower + "n't")
                # 可能是 't 结尾的缩写 (cant -> can't = can + 't)
                m2 = re.match(r"(.+?)t$", w_lower)
                if m2:
                    base = m2.group(1)
                    candidates.append(base + "n't")
                    candidates.append(base + "'t")
                # 'm, 've, 're, 'll, 'd
                for suffix in ["'m", "'ve", "'re", "'ll", "'d", "'s"]:
                    candidates.append(w_lower + suffix)
                # 也检查去掉最后一个字母 + 't 的形式
                if len(w_lower) > 1:
                    candidates.append(w_lower[:-1] + "'t")
                for cand in candidates:
                    if cand in word_set and words[cand]["level"] != words[w_lower]["level"]:
                        print(f"  CONFLICT: {w}({words[w]['level']}) vs {cand}({words[cand]['level']})")
                        variants_conflicts.append({
                            "word1": w,
                            "level1": words[w]["level"],
                            "word2": cand,
                            "level2": words[cand]["level"],
                        })

    # ============================================================
    # 类别4: 词形还原不规则映射词在词表中的等级检查
    # ============================================================
    print("\n[类别4] 不规则词形还原检测:")
    print("-" * 70)

    irregular_lemmas_issues = []
    for past_form, lemma in IRREGULAR_LEMMAS.items():
        if past_form in word_set:
            pf_level = words[past_form]["level"]
            if lemma in word_set:
                lemma_level = words[lemma]["level"]
                pf_num = level_num.get(pf_level, 7)
                lemma_num = level_num.get(lemma_level, -1)
                if pf_num > lemma_num:
                    print(f"  PAST > LEMMA: {past_form}({pf_level}) vs {lemma}({lemma_level})")
                    irregular_lemmas_issues.append({
                        "word": past_form,
                        "level": pf_level,
                        "should_be": lemma_level,
                        "maps_to": lemma,
                    })

    # ============================================================
    # 类别5: 查找与 A1 核心词冲突的词（词形还原可能出错）
    # ============================================================
    print("\n[类别5] 词形还原后等级下降检测 (suffix stripping 可能把 B1+ 词还原到 A1 核心词):")
    print("-" * 70)

    lemma_issues = []
    suffix_rules = [
        ("ies", "y"), ("es", ""), ("ed", ""), ("ing", ""),
        ("ly", ""), ("ness", ""), ("ment", ""), ("tion", "t"), ("s", "")
    ]

    for w in word_list:
        w_lower = w.lower()
        # 跳过核心 A1 词本身
        if w_lower in CORE_A1:
            continue
        # 尝试各种 suffix stripping
        for suffix, replacement in suffix_rules:
            if w_lower.endswith(suffix) and len(w_lower) > len(suffix) + 2:
                base = w_lower[:-len(suffix)] + replacement
                if base in word_set:
                    w_level_num = level_num.get(words[w_lower]["level"], 7)
                    base_level_num = level_num.get(words[base]["level"], -1)
                    # 如果去掉后缀后的 base 是 A1/A2，但原词是更高等级
                    # 这说明这个词本身是高级词，不需要特别处理
                    # 但如果 base 本身是 SUPER 或者不在核心列表里，可能有问题
                    pass
                elif base in CORE_A1:
                    w_level_num = level_num.get(words[w_lower]["level"], 7)
                    base_level_num = 0  # A1
                    if w_level_num > base_level_num:
                        print(f"  {w}({words[w]['level']}) lemmatizes to CORE_A1 '{base}' — may cause confusion")

    # ============================================================
    # 类别6: 全面扫描所有带撇号的词条
    # ============================================================
    print("\n[类别6] 带撇号词条检查 (合法词素列表):")
    print("-" * 70)

    # 合法词素后缀
    VALID_SUFFIXES = {"'s", "'t", "'d", "'m", "'re", "'ve", "'ll", "'ll"}
    # 常见缩写主词
    COMMON_PRONOUNS = {"i", "you", "he", "she", "it", "we", "they", "that", "what",
                       "who", "where", "when", "how", "this", "there", "here", "let",
                       "will", "can", "do", "shall", "would", "could", "should",
                       "is", "are", "was", "were", "have", "has", "had"}

    apostrophe_words = []
    for w in word_list:
        if "'" in w:
            level = words[w]["level"]
            # 验证是否是正确的缩写形式
            # 模式1: n't 结尾
            m = re.match(r"(.+?)n't$", w, re.IGNORECASE)
            if m:
                base = m.group(1).lower()
                if base in COMMON_PRONOUNS or base in word_set:
                    apostrophe_words.append(w)
                    continue
            # 模式2: 's, 'd, 'm, 're, 've, 'll
            m2 = re.match(r"(.+?)'(s|d|m|re|ve|ll)$", w, re.IGNORECASE)
            if m2:
                base = m2.group(1).lower()
                if base in COMMON_PRONOUNS or base in word_set:
                    apostrophe_words.append(w)
                    continue
            # 其他带撇号的词
            apostrophe_words.append(w)
            # 检查等级是否合理
            if level in ["SUPER", "C1", "C2"]:
                print(f"  SUSPICIOUS high level for apostrophe form: {w} -> {level}")

    print(f"  Total apostrophe words: {len(apostrophe_words)}")
    print(f"  Sample: {apostrophe_words[:20]}")

    # ============================================================
    # 综合汇总: 需要删除的词
    # ============================================================
    print("\n" + "=" * 80)
    print("SUMMARY: ALL WORDS TO REMOVE")
    print("=" * 80)

    to_remove = set()

    # 从类别1添加
    for p in known_problematic:
        to_remove.add(p["word"])

    # 从类别2添加
    for c in additional_contractions:
        to_remove.add(c)

    # 手动枚举的不标准缩写（从之前的 Shell 脚本发现）
    manual_contractions = [
        "im", "cant", "dont", "wont", "shant", "ive", "id", "ill",
        "theyd", "weve", "well", "youll", "youd", "youre", "theyre",
        "were",  # ambiguous but we已知 we+'re -> were is a real word at A2, 
        "theyd", "theyll", "theyve", "youve", "isnt", "arent", "wasnt",
        "werent", "havent", "hasnt", "hadnt", "doesnt", "didnt",
        "couldnt", "wouldnt", "shouldnt", "mustnt", "mightnt", "aint",
        # 其他口语常见缩写变体
        "lets",  # let + 's (should be let's but 'let's' in vocab should be ok)
        "thats", "whats", "whos", "wheres", "whens", "hows", "theres",
        "heres", "thered", "hereby",  # unlikely but check
        "gonna", "wanna", "gotta", "kinda", "sorta", "outta", "lotsa",
        "dunno", "lemme", "gimme", "hafta", "supposedta", "shoulda",
        "coulda", "woulda", "mighta", "musta",
        "ima",  # i'm going to
        "u", "ur", "r", "b", "c", "y", "n",  # 口语单字母缩写
        "rn",  # right now
        "omg", "wtf", "lol", "lmao", "imo", "idk", "tbh", "imo",
        "fyi", "btw", "asap", "afaik", "irl",
        "yall", "yall",  # you all
    ]

    # 检查这些是否在词表里
    for w in manual_contractions:
        if w in word_set:
            to_remove.add(w)
            print(f"  ADD manual: {w} -> {words[w]['level']}")

    print(f"\nTotal words to remove: {len(to_remove)}")
    print("\nFull removal list:")
    for w in sorted(to_remove):
        print(f"  '{w}': {words.get(w, {}).get('level', 'UNKNOWN')}")

    # ============================================================
    # 验证: 检查词形还原链是否正确
    # ============================================================
    print("\n" + "=" * 80)
    print("VERIFICATION: Lookup chain for key words AFTER removal")
    print("=" * 80)

    # 模拟 JS lookup chain
    def simulate_lookup(word, word_map):
        lower = word.lower()
        # step 1
        if lower in word_map:
            return ("direct", lower, word_map[lower]["level"])
        # step 2: lemmatize
        for suffix, replacement in suffix_rules:
            if lower.endswith(suffix) and len(lower) > len(suffix) + 2:
                base = lower[:-len(suffix)] + replacement
                if base in word_map:
                    return ("lemma", base, word_map[base]["level"])
        # step 3: normalize nonstandard
        if lower in KNOWN_NORMALIZE:
            mapped = KNOWN_NORMALIZE[lower]
            if mapped in word_map:
                return ("normalize", mapped, word_map[mapped]["level"])
        # step 4: strip contraction
        m = re.match(r"(.+?)n't$", lower)
        if m:
            base = m.group(1)
            special = {"wont": "will"}
            base = special.get(base, base)
            if base in word_map:
                return ("strip_nt", base, word_map[base]["level"])
        m2 = re.match(r"(.+?)'(s|d|m|re|ve|ll)$", lower)
        if m2:
            base = m2.group(1).lower()
            if base in word_map:
                return ("strip_apostrophe", base, word_map[base]["level"])
        return ("not_found", None, None)

    test_words = ["im", "cant", "dont", "wont", "say", "can", "do", "i",
                   "you", "the", "say", "said", "weren't", "didn't", "it's",
                   "I'm", "Can't", "Dont", "wont", "shes", "hes", "lets",
                   "thats", "whats", "gonna", "wanna", "gotta", "lemme",
                   "dunno", "ima", "yall", "aint", "youve", "theyve", "isnt"]

    print(f"\n{'Word':<20} {'Step':<20} {'Result':<10} {'Expected'}")
    print("-" * 70)

    # 用当前词表（有问题的）
    for tw in test_words:
        step, result_word, level = simulate_lookup(tw, words)
        expected = "A1" if tw.lower() in ["im","cant","dont","wont","ive","id","ill",
                                          "youd","wed","theyd","youll","theyll",
                                          "youve","theyve","youre","theyre"] else (
                    "A1" if tw.lower() in ["i","can","do","will","be","have","they",
                                           "we","you","it","that","what","who",
                                           "let","say","go","get"] else "OK")
        print(f"  {tw:<18} {step:<20} {level or 'null':<10} (was: {expected})")

    # ============================================================
    # 输出报告文件
    # ============================================================
    report = []
    report.append("=" * 80)
    report.append("CEFR VOCABULARY PROBLEMATIC WORDS REPORT")
    report.append("=" * 80)
    report.append(f"Total words in vocab: {len(words)}")
    report.append(f"Words to remove: {len(to_remove)}")
    report.append("")

    report.append("## CATEGORY 1: Known normalizeNonstandardContraction entries")
    for p in known_problematic:
        report.append(f"  '{p['word']}' -> {p['level']} (should map to '{p['maps_to']}' -> {p['should_be']}) [SEVERITY: {p['severity']}]")

    report.append("")
    report.append("## CATEGORY 2: Additional nonstandard contractions found")
    for c in additional_contractions:
        report.append(f"  '{c}' -> {words[c]['level']}")

    report.append("")
    report.append("## CATEGORY 3: Manual contractions to remove")
    for w in sorted(to_remove):
        if w in words:
            report.append(f"  '{w}' -> {words[w]['level']}")

    report.append("")
    report.append("## FULL REMOVAL LIST")
    for w in sorted(to_remove):
        if w in words:
            report.append(f"  REMOVE: '{w}' -> {words[w]['level']}")

    report_text = "\n".join(report)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(report_text)

    print(f"\nReport written to: {OUTPUT_PATH}")
    print(f"\n{'='*80}")
    print(f"SUMMARY: Remove {len(to_remove)} words from vocab")
    print(f"Full list written to: {OUTPUT_PATH}")
    print(f"{'='*80}")

    return to_remove, words

if __name__ == "__main__":
    removed, words = main()
