"""fix_vocab_analyzer.py — Replace the broken _normalizeNonstandardContraction function"""
import re

with open('frontend/src/utils/vocabAnalyzer.js', 'r', encoding='utf-8') as f:
    content = f.read()

func_start = content.find('  _normalizeNonstandardContraction(word) {')
func_end = content.find('\n  _stripContraction(word) {', func_start)

if func_start == -1 or func_end == -1:
    print(f'ERROR: func_start={func_start}, func_end={func_end}')
    exit(1)

new_func = r"""  _normalizeNonstandardContraction(word) {
    const lower = word.toLowerCase();
    // 不带撇号的不标准缩写映射
    // 策略：优先映射到 A1/A2 核心词，避免简单词被误标为高等级
    // 注意：以下所有条目已从词表中删除（cefr_vocab_fixed.json），
    // 它们的查询现在走不到 Step1 直接命中，需要在 Step3 正确还原。
    const map = {
      // JS 层原始映射
      "dont": "do", "cant": "can", "wont": "will", "shant": "shall",
      "im": "i", "ive": "i", "id": "i", "ill": "i",
      "theyve": "they", "theyll": "they", "theyd": "they",
      "weve": "we", "well": "we", "wed": "we",
      "youll": "you", "youd": "you", "its": "it",
      "thats": "that", "whats": "what", "wheres": "where",
      "whos": "who", "whens": "when", "hows": "how", "lets": "let",
      // missing-apostrophe n't 模式
      "didnt": "do", "doesnt": "do", "isnt": "is", "wasnt": "be",
      "arent": "be", "werent": "be", "havent": "have", "hasnt": "have",
      "hadnt": "have", "couldnt": "can", "wouldnt": "will",
      "shouldnt": "shall", "mustnt": "must", "mightnt": "might", "aint": "be",
      // 带撇号缩写去掉撇号
      "shes": "she", "hes": "he", "youre": "you", "theyre": "they",
      "youve": "you", "gonna": "go", "wanna": "want", "gotta": "get",
      "outta": "out", "kinda": "kind", "sorta": "sort",
      "lemme": "let", "gimme": "give", "dunno": "know",
      "shoulda": "should", "coulda": "could", "woulda": "would",
      "musta": "must", "ima": "i",
      // 网络/短信俚语
      "u": "you", "ur": "your", "r": "are", "b": "be", "c": "see",
      "y": "why", "n": "and", "rn": "right", "yall": "you",
      "lol": "laugh", "lmao": "laugh", "omg": "oh",
      "bruh": "brother", "smh": "shake", "ngl": "not",
      "ikr": "i", "ik": "i", "tbt": "throwback", "fomo": "fear",
      "yolo": "you", "v": "very", "btw": "by", "fyi": "for",
      "asap": "as", "irl": "in", "idk": "know", "tbh": "to",
      // 词形还原错误兜底
      "whered": "where",
      // 撇号前缀碎片
      "'the": "the", "'you": "you",
    };
    if (map[lower] !== undefined) return map[lower];
    return null;
  }

"""

new_content = content[:func_start] + new_func + content[func_end:]

with open('frontend/src/utils/vocabAnalyzer.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'Fixed. Old length: {len(content)}, New length: {len(new_content)}')
print(f'Delta: {len(new_content) - len(content)} bytes')
