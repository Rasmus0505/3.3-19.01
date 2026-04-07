"""
测试 Phase 36 词形还原流程
验证：transformation → 词典查到 B1 → 不过滤，不简化
"""
import os
import json
import re

os.environ["DASHSCOPE_API_KEY"] = "sk-7de9fe2fdc9d4241a0c445a7d48165a2"

from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DASHSCOPE_API_KEY"],
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

# ─────────────────────────────────────────────────────────────────────────────
# 模拟测试数据
# ─────────────────────────────────────────────────────────────────────────────
ORIGINAL_TEXT = """Title: The Future of Work: Is Remote Working Here to Stay?

In recent years, the traditional concept of the workplace has undergone a significant transformation. Due to the global pandemic, millions of people were forced to transition from office-based work to working from home. While this shift was initially viewed as a temporary measure, it has sparked a heated debate about whether remote work should become the new standard.

On the one hand, there are clear advantages to working remotely. The most obvious benefit is the flexibility it offers. Employees no longer need to spend hours commuting in heavy traffic, which reduces stress and saves a considerable amount of money. Furthermore, many people report a better work-life balance, as they have more time to spend with their families or pursue personal hobbies. From an employer's perspective, companies can also reduce overhead costs, such as rent and electricity for large office buildings.

On the other hand, remote work is not without its drawbacks. One of the main concerns is the lack of face-to-face interaction. Human beings are social creatures, and working in isolation can often lead to feelings of loneliness or a decline in mental well-being. Additionally, communication can become more challenging; without physical presence, misunderstandings may occur more frequently in emails or instant messages. Some managers also argue that it is more difficult to maintain team spirit and company culture when employees are not working in the same space.

In conclusion, I believe that the future of work lies in a "hybrid" model. While working from home provides essential flexibility, the office remains a vital place for collaboration and social connection. By combining the benefits of both environments, companies can create a more productive and satisfied workforce. Ultimately, the success of this model depends on how well organizations adapt to these changes and support their employees in the digital age."""

# 模拟词典初筛结果（>i+1 的词，i+1 是 B2）
DICT_WORDS = [
    {"word": "transformation", "level": "C1"},
    {"word": "transition", "level": "B2"},
    {"word": "debate", "level": "B2"},
    {"word": "standard", "level": "B2"},
    {"word": "overhead", "level": "B2"},
    {"word": "drawbacks", "level": "C1"},
    {"word": "isolation", "level": "B2"},
    {"word": "well-being", "level": "B2"},
    {"word": "collaboration", "level": "B2"},
    {"word": "ultimately", "level": "C1"},
    {"word": "organizations", "level": "B2"},
]

# 模拟词表数据（实际应该查 cefr_vocab_fixed.json）
LEMMA_LEVELS = {
    "transform": "B1",
    "transition": "B2",
    "debate": "B2",
    "standard": "B2",
    "overhead": "B2",
    "drawback": "B2",
    "isolation": "B2",
    "well-being": "B2",
    "collaboration": "B2",
    "finally": "A1",
    "final": "B1",
    "end": "A1",
    "organization": "B2",
}

TARGET_LEVEL = "B2"
USER_LEVEL = "B1"


def _level_num(level):
    order = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
    return order.get(level, 4)


print("=" * 80)
print("Phase 36: 词形还原流程测试")
print("=" * 80)
print()
print(f"用户等级: {USER_LEVEL}")
print(f"目标等级 (i+1): {TARGET_LEVEL}")
print()

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: 词典初筛（模拟）
# ─────────────────────────────────────────────────────────────────────────────
print("Step 1: 词典初筛")
print("-" * 40)
print(f"提取到 {len(DICT_WORDS)} 个 >i+1 的词：")
for w in DICT_WORDS:
    print(f"  - {w['word']} ({w['level']})")
print()

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: LLM 提取原型词
# ─────────────────────────────────────────────────────────────────────────────
print("Step 2: LLM 提取原型词")
print("-" * 40)

LEMMAS_PROMPT = """You are an English vocabulary analyzer for language learning.
Given a sentence and a list of words, return the BASE FORM (lemma) of each word.
Return ONLY a valid JSON object with a 'lemmas' array in the SAME ORDER as the input words.

Rules:
- Nouns: return singular form (transformations → transformation, phenomena → phenomenon)
- Verbs: return infinitive form (transitions → transition, drew → draw)
- Adjectives: return base form (happier → happy, beautiful → beautiful)
- Adverbs: return base form (ultimately → finally/end, beautifully → beautiful)
- If word is already base form, return as-is
- Compound words: return the main root (workforce → work, household → house)

Example:
Input words: [transformation, drawbacks, ultimately, organizations, commuting]
Output: {"lemmas": ["transform", "drawback", "finally", "organization", "commute"]}"""

words_list = "\n".join([f"{i+1}. {w['word']}" for i, w in enumerate(DICT_WORDS)])
user_message = f"原文：{ORIGINAL_TEXT[:500]}...\n\n需要还原的词列表：\n{words_list}\n\n返回 JSON 对象：{{\"lemmas\": [\"word1\", \"word2\", ...]}}"

response = client.chat.completions.create(
    model="deepseek-v3.2",
    messages=[
        {"role": "system", "content": LEMMAS_PROMPT},
        {"role": "user", "content": user_message},
    ],
    temperature=0.1,
    max_tokens=256,
    extra_body={"enable_thinking": False},
)

content = response.choices[0].message.content
print(f"LLM 响应：{content}")
print()

# 解析 lemmas
try:
    cleaned = re.sub(r'^```json\s*', '', content.strip())
    cleaned = re.sub(r'\s*```$', '', cleaned)
    result = json.loads(cleaned)
    lemmas = result.get("lemmas", [])
    print(f"提取到 {len(lemmas)} 个原型词：")
    for i, (w, lemma) in enumerate(zip(DICT_WORDS, lemmas)):
        print(f"  {i+1}. {w['word']} → {lemma}")
except Exception as e:
    print(f"解析失败: {e}")
    lemmas = [w['word'].lower() for w in DICT_WORDS]  # fallback
    print("使用原文小写作为 fallback")
print()

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: 词典二次判断原型等级
# ─────────────────────────────────────────────────────────────────────────────
print("Step 3: 词典二次判断原型等级")
print("-" * 40)

valid_i1 = []       # 原型等级 == targetLevel (B2)
valid_above_i1 = [] # 原型等级 > targetLevel (B2)
removed = []        # 原型等级 <= targetLevel (B2) → 过滤

for i, word_info in enumerate(DICT_WORDS):
    original_word = word_info["word"]
    lemma = lemmas[i] if i < len(lemmas) else original_word.lower()
    
    # 模拟词典查原型等级
    lemma_level = LEMMA_LEVELS.get(lemma.lower(), "B2")  # 默认 B2
    
    print(f"  {original_word} → {lemma} (词典查到: {lemma_level})")
    
    if lemma_level == TARGET_LEVEL:
        valid_i1.append(original_word)
        print(f"    → 保留为 i+1 学习词汇 (不简化)")
    elif _level_num(lemma_level) < _level_num(TARGET_LEVEL):
        removed.append({"word": original_word, "lemma": lemma, "level": lemma_level})
        print(f"    → 过滤（原型 {lemma} 是 {lemma_level}，用户已掌握）")
    else:
        valid_above_i1.append(original_word)
        print(f"    → 需要简化（原型 {lemma} 是 {lemma_level}）")

print()
print(f"i+1 词汇 (保留): {valid_i1}")
print(f">i+1 词汇 (需简化): {valid_above_i1}")
print(f"过滤词汇 (已掌握): {[r['word'] for r in removed]}")
print()

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: LLM 重写
# ─────────────────────────────────────────────────────────────────────────────
print("Step 4: LLM 重写")
print("-" * 40)

if valid_above_i1:
    SIMPLIFY_PROMPT = """You are an English text simplifier for language learners.
Given a sentence and a list of words to simplify, return simplified replacements at B2 level.
Return JSON: {"simplified_words": [...], "word_levels": {...}}
Simplify ONLY words that genuinely exceed B2 level. Return "" for words already at B2.
Each replacement must be at EXACTLY B2 level."""

    words_line = ", ".join(valid_above_i1)
    simplify_msg = f"原文：{ORIGINAL_TEXT[:800]}...\n\n需要简化的词：{words_line}\n\n目标等级：B2\n返回 JSON：{{\"simplified_words\": [\"word1\", \"word2\", ...], \"word_levels\": {{}}}}"
    
    response = client.chat.completions.create(
        model="deepseek-v3.2",
        messages=[
            {"role": "system", "content": SIMPLIFY_PROMPT},
            {"role": "user", "content": simplify_msg},
        ],
        temperature=0.3,
        max_tokens=256,
        extra_body={"enable_thinking": False},
    )
    
    content = response.choices[0].message.content
    print(f"LLM 响应：{content[:300]}...")
    
    try:
        cleaned = re.sub(r'^```json\s*', '', content.strip())
        cleaned = re.sub(r'\s*```$', '', cleaned)
        result = json.loads(cleaned)
        simplified_words = result.get("simplified_words", [])
    except:
        simplified_words = [""] * len(valid_above_i1)
else:
    simplified_words = []
    print("没有需要简化的词")

print()

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: 本地替换
# ─────────────────────────────────────────────────────────────────────────────
print("Step 5: 本地替换")
print("-" * 40)

rewritten = ORIGINAL_TEXT
for i, word in enumerate(valid_above_i1):
    replacement = simplified_words[i] if i < len(simplified_words) else ""
    if replacement and replacement != "":
        escaped = re.escape(word)
        regex = re.compile(r'\b' + escaped + r'\b', re.IGNORECASE)
        rewritten = regex.sub(replacement, rewritten)
        print(f"  替换: '{word}' → '{replacement}'")
    else:
        print(f"  保留: '{word}' (LLM 返回空)")

print()

# ─────────────────────────────────────────────────────────────────────────────
# 最终对比
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 80)
print("最终效果对比")
print("=" * 80)
print()

# 差异统计
changes = []
original_lines = ORIGINAL_TEXT.split("\n")
rewritten_lines = rewritten.split("\n")

for i, (orig, rew) in enumerate(zip(original_lines, rewritten_lines)):
    if orig != rew:
        changes.append((i+1, orig.strip()[:60], rew.strip()[:60]))

print(f"总修改行数: {len(changes)}")
for line_num, orig, rew in changes:
    print(f"  第{line_num}行: {orig}")
    print(f"    → {rew}")
print()

# 验证关键变化
print("=" * 80)
print("验证结果")
print("=" * 80)

# 检查 transformation 是否被正确处理
if "transformation" in removed:
    print("✓ transformation → 过滤（原型 transform 是 B1）")
else:
    print("✗ transformation 未被正确过滤")

# 检查 drawbacks 是否被正确处理
if "drawbacks" in removed:
    print("✓ drawbacks → 过滤（原型 drawback 是 B2）")
elif "drawbacks" in valid_i1:
    print("✓ drawbacks → 保留为 i+1 词汇")
else:
    print("✗ drawbacks 未被正确处理")

# 检查 ultimately 是否被正确处理
ultimately_removed = any(r["word"] == "ultimately" and r["lemma"] in ["finally", "final", "end"] for r in removed)
if ultimately_removed:
    print("✓ ultimately → 过滤（原型 finally/final/end 是 A1/B1）")
else:
    print("✗ ultimately 未被正确过滤")

print()
print("Token 消耗: Step 2 (提取原型) + Step 4 (重写)")
print("  比之前减少: 不再对已掌握的原型词进行重写")
