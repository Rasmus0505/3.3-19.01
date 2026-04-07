"""
测试阅读重写功能的脚本
直接调用 DeepSeek API，模拟 /filter-and-simplify-words 端点的行为
"""
import os
import json
import re
from openai import OpenAI

# DeepSeek API 配置
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
DEEPSEEK_MODEL = "deepseek-v3.2"
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()

# 测试文本
TEST_ARTICLE = """Title: The Future of Work: Is Remote Working Here to Stay?

In recent years, the traditional concept of the workplace has undergone a significant transformation. Due to the global pandemic, millions of people were forced to transition from office-based work to working from home. While this shift was initially viewed as a temporary measure, it has sparked a heated debate about whether remote work should become the new standard.

On the one hand, there are clear advantages to working remotely. The most obvious benefit is the flexibility it offers. Employees no longer need to spend hours commuting in heavy traffic, which reduces stress and saves a considerable amount of money. Furthermore, many people report a better work-life balance, as they have more time to spend with their families or pursue personal hobbies. From an employer's perspective, companies can also reduce overhead costs, such as rent and electricity for large office buildings.

On the other hand, remote work is not without its drawbacks. One of the main concerns is the lack of face-to-face interaction. Human beings are social creatures, and working in isolation can often lead to feelings of loneliness or a decline in mental well-being. Additionally, communication can become more challenging; without physical presence, misunderstandings may occur more frequently in emails or instant messages. Some managers also argue that it is more difficult to maintain team spirit and company culture when employees are not working in the same space.

In conclusion, I believe that the future of work lies in a "hybrid" model. While working from home provides essential flexibility, the office remains a vital place for collaboration and social connection. By combining the benefits of both environments, companies can create a more productive and satisfied workforce. Ultimately, the success of this model depends on how well organizations adapt to these changes and support their employees in the digital age."""


# 简化词系统提示（来自 llm.py）
SIMPLIFY_WORDS_SYSTEM_PROMPT = """You are an English text simplifier for language learners.
Given a sentence and a list of words/phrases to simplify from that sentence,
return a JSON object with two fields:
1. 'simplified_words': array of simplified replacements, IN THE SAME ORDER as the input list
2. 'word_levels': object mapping each input word to its CEFR level you judged (e.g. {{'word': 'C1'}})

## CRITICAL: EXACT i+1 Simplification Rule
- Simplify words ONLY to {target_level} level — NOT simpler, NOT harder
- For target B1: 'perusing' (B2) → 'reading' (B1), NOT 'looking at' (A1)
- For target B1: 'ambulate' (C1) → 'walk' (B1), NOT 'move' (A1)
- Oversimplification is WRONG: use a word at exactly {target_level}, not lower

## CEFR Level Verification (MUST do first)
Your FIRST task is to verify each word's CEFR level:
- Look up the BASE FORM of each word (e.g. 'fixing' → base: 'fix')
- If base form is at or below {target_level} → level = '{target_level}' (no simplification needed)
- If base form exceeds {target_level} → assign actual level (B1, B2, C1, C2, etc.)

## When to simplify (return a replacement at {target_level})
- The word's base form genuinely exceeds {target_level} level
- The replacement MUST be at EXACTLY {target_level} level

## When to return "" (empty string — keep original)
- Base form is at or below {target_level} (no simplification needed)
- The context already clarifies the word's meaning adequately

Rules:
- Return ONLY a valid JSON object with 'simplified_words' and 'word_levels' — no markdown fences, no extra text
- Each simplified_words entry must be at EXACTLY {target_level} level
- Preserve the original meaning and part of speech where possible
- Do NOT reorder — match input order exactly

IMPORTANT: EXACT i+1 only. 'perusing' for B1 → 'reading', NOT 'looking at'. 'ambulate' for B1 → 'walk', NOT 'move'."""


# 测试用的词汇列表（模拟词典筛选出的高难度词）
TEST_WORDS = [
    "transformation", "transition", "heavily", "debate", "standard",
    "flexibility", "commuting", "overhead", "drawbacks", "isolation",
    "mental", "well-being", "misunderstandings", "collaboration", "ultimately"
]


def call_deepseek(messages, enable_thinking=False):
    """调用 DeepSeek API"""
    client = OpenAI(api_key=DASHSCOPE_API_KEY, base_url=DEEPSEEK_BASE_URL)
    
    extra_body = {}
    if not enable_thinking:
        extra_body["enable_thinking"] = False
    
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
        extra_body=extra_body if extra_body else None,
    )
    
    return response.choices[0].message.content, response.usage


def simplify_words(sentence, words, target_level="B1"):
    """调用简化词汇接口"""
    client = OpenAI(api_key=DASHSCOPE_API_KEY, base_url=DEEPSEEK_BASE_URL)
    
    system_prompt = SIMPLIFY_WORDS_SYSTEM_PROMPT.format(target_level=target_level)
    
    user_message = f"""原文：{sentence}
目标等级：{target_level}

返回 JSON 对象：{{"simplified_words":[...],"word_levels":{{...}}}}
simplified_words 与输入词顺序一致，"" 表示不简化。"""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
    
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
        extra_body={"enable_thinking": False},
    )
    
    return response.choices[0].message.content, response.usage


def main():
    if not DASHSCOPE_API_KEY:
        print("错误: 请设置 DASHSCOPE_API_KEY 环境变量")
        print("export DASHSCOPE_API_KEY='your-api-key'")
        return
    
    print("=" * 80)
    print("测试阅读重写功能")
    print("=" * 80)
    print()
    
    # 1. 测试 Token 估算
    print("[1] Token 估算测试")
    print("-" * 40)
    char_count = len(TEST_ARTICLE)
    estimated_tokens = max(1, char_count // 4)
    print(f"原文字符数: {char_count}")
    print(f"估算 tokens: {estimated_tokens} (按 4字符/token)")
    print()
    
    # 2. 测试词汇简化
    print("[2] 词汇简化测试 (简化一段话中的高难度词)")
    print("-" * 40)
    test_sentence = "The traditional concept of the workplace has undergone a significant transformation."
    print(f"原文: {test_sentence}")
    print()
    
    content, usage = simplify_words(
        test_sentence, 
        ["traditional", "concept", "transformation", "undergone"],
        target_level="B1"
    )
    
    print("模型返回内容:")
    print(content)
    print()
    print(f"Token 使用: prompt={usage.prompt_tokens}, completion={usage.completion_tokens}, total={usage.total_tokens}")
    print()
    
    # 解析 JSON
    try:
        # 去掉 markdown 代码块
        cleaned = re.sub(r'^```json\s*', '', content.strip())
        cleaned = re.sub(r'\s*```$', '', cleaned)
        result = json.loads(cleaned)
        print("解析后的结果:")
        print(f"  simplified_words: {result.get('simplified_words')}")
        print(f"  word_levels: {result.get('word_levels')}")
    except Exception as e:
        print(f"JSON 解析失败: {e}")
    print()
    
    # 3. 测试生成阅读材料
    print("[3] 生成阅读材料测试")
    print("-" * 40)
    
    system_prompt = """You are an English reading material generator for language learners. 
Generate engaging, grade-appropriate reading passages that naturally incorporate the provided vocabulary words. 
The reading level should target the specified CEFR level (A1, A2, B1, B2, C1). 
Include comprehension questions after the passage. 
Format output as clean markdown."""
    
    user_prompt = f"""Target CEFR Level: B1
Vocabulary words to incorporate: {', '.join(TEST_WORDS[:5])}

Please generate a reading passage (around 200-400 words) that naturally uses these words in context. 
Include 3-5 comprehension questions at the end. 
Make sure the reading is appropriate for B1 level learners."""
    
    client = OpenAI(api_key=DASHSCOPE_API_KEY, base_url=DEEPSEEK_BASE_URL)
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=2048,
    )
    
    print("生成的阅读材料:")
    print(response.choices[0].message.content)
    print()
    print(f"Token 使用: prompt={response.usage.prompt_tokens}, completion={response.usage.completion_tokens}, total={response.usage.total_tokens}")
    print()
    
    # 4. 总结
    print("=" * 80)
    print("测试完成")
    print("=" * 80)
    print()
    print("LLM Usage Logs 会记录的内容:")
    print("  - category: 'simplify' 或 'llm'")
    print("  - model_name: 'deepseek-v3.2'")
    print("  - prompt_tokens: 输入的 token 数")
    print("  - completion_tokens: 输出的 token 数")
    print("  - reasoning_tokens: 思考 token 数 (如果有)")
    print("  - total_tokens: 总 token 数")
    print("  - input_text_preview: 输入文本的前 200 字符")
    print("  - trace_id: 本次调用的唯一标识")
    print("  - charge_cents: 本次消耗的积分")


if __name__ == "__main__":
    main()
