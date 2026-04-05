/**
 * vocabAnalyzer.js — 词汇分析服务
 * ==================================
 * MIT License（基于 COCA 词频数据）
 *
 * 功能：
 * 1. 加载本地词汇表（浏览器缓存）
 * 2. 分析每句话的 CEFR 难度
 * 3. 标注每个词的等级（用于 i+1 生词高亮）
 * 4. 判断用户水平是否适合当前内容
 *
 * 使用方式：
 *   const analyzer = new VocabAnalyzer();
 *   await analyzer.load();                          // 首次加载词汇表
 *   const result = analyzer.analyzeSentence(text);   // 分析单句
 *   const report = analyzer.analyzeVideo(sentences); // 分析整段视频
 */

function resolveCefrVocabFetchUrls(primaryPath) {
  const urls = [];
  const seen = new Set();
  const add = (u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  };
  add(primaryPath);
    add("/data/vocab/cefr_vocab_fixed.json");
    const base =
      typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL
        ? String(import.meta.env.BASE_URL).replace(/\/+$/, "")
        : "";
    if (base) {
      add(`${base}/data/vocab/cefr_vocab_fixed.json`.replace(/([^:]\/)\/+/g, "$1"));
  }
  return urls;
}

const CURRENT_VOCAB_VERSION = "fixed-v1";

function isValidCefrVocabPayload(data) {
  return Boolean(
    data &&
    typeof data === "object" &&
    data.words &&
    typeof data.words === "object" &&
    data._vocab_version === CURRENT_VOCAB_VERSION
  );
}

class VocabAnalyzer {
  constructor(options = {}) {
    // 词汇表路径（可以是本地路径或 CDN）
    this.vocabPath = options.vocabPath || "/data/vocab/cefr_vocab_fixed.json";

    // 词汇表数据
    this.vocabData = null;      // 完整 JSON
    this.wordMap = null;        // 词→{rank, level} 的 Map

    // 是否已加载
    this.isLoaded = false;

    // 词形还原映射表（常见不规则变化）
    this.lemmatizationMap = this._buildLemmatizationMap();

    // 常见无意义词（stopwords）
    this.stopwords = this._buildStopwords();
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /**
   * 加载词汇表（首次调用或强制重新加载）
   * @param {boolean} forceReload - 是否强制从网络重新加载
   * @returns {Promise<void>}
   */
  async load(forceReload = false) {
    if (this.isLoaded && !forceReload) {
      return;
    }

    // 优先从浏览器缓存读取（避免重复下载）
    if (!forceReload) {
      const cached = sessionStorage.getItem("cefr_vocab_cache");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (isValidCefrVocabPayload(parsed)) {
            this._initFromData(parsed);
            return;
          }
        } catch (_) {
          /* 旧缓存可能是 HTML 404 页，丢弃 */
        }
        try {
          sessionStorage.removeItem("cefr_vocab_cache");
        } catch (_) {
          /* ignore */
        }
      }
    }

    const urls = resolveCefrVocabFetchUrls(this.vocabPath);
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastError = new Error(`加载词汇表失败 (${url}): ${response.status}`);
          continue;
        }
        const data = await response.json();
        if (!isValidCefrVocabPayload(data)) {
          lastError = new Error(`词汇表格式无效 (${url})`);
          continue;
        }
        try {
          sessionStorage.setItem("cefr_vocab_cache", JSON.stringify(data));
        } catch (_) {
          /* 超大 JSON 在部分环境可能写满 — 仍可在内存中使用 */
        }
        this._initFromData(data);
        this.vocabPath = url;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error("加载词汇表失败: 无可用 URL");
  }

  /**
   * 分析单句话
   * @param {string} sentence - 英文句子
   * @returns {VocabSentenceResult}
   */
  analyzeSentence(sentence) {
    if (!this.isLoaded) {
      throw new Error("词汇表未加载，请先调用 load()");
    }

    const tokens = this._tokenize(sentence);
    const wordResults = [];
    const levelCounts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, SUPER: 0 };
    let totalRank = 0;

    for (const token of tokens) {
      const wordInfo = this._lookupWord(token);
      if (!wordInfo) {
        // 词不在表里（专有名词、数字等）—— 标记为 SUPER 级别（统一小写便于与 UI token 对齐）
        wordResults.push({ word: token.toLowerCase(), level: "SUPER", rank: null, isUnknown: true });
        levelCounts["SUPER"]++;
        continue;
      }

      wordResults.push(wordInfo);
      levelCounts[wordInfo.level]++;
      totalRank += wordInfo.rank;
    }

    // 计算平均难度排名
    const avgRank = tokens.length > 0 ? totalRank / tokens.filter(t => this._lookupWord(t)).length : 0;

    // 判断整体难度：第一个达到 90% 的等级
    const grade = this._computeOverallLevel(levelCounts, tokens.length);

    return {
      original: sentence,
      tokens: wordResults,
      totalWords: tokens.length,
      unknownWords: tokens.filter(t => this._lookupWord(t) === null).length,
      levelCounts,
      grade,
      avgRank: Math.round(avgRank),
      // 找出 i+1 生词（比用户水平高1-2级的词）
      newVocab: this._findNewVocab(wordResults),
    };
  }

  /**
   * 分析整段视频（多句字幕）
   * @param {string[]} sentences - 字幕句子数组
   * @param {string} userLevel - 用户当前水平（默认 B1）
   * @returns {VocabVideoResult}
   */
  analyzeVideo(sentences, userLevel = "B1") {
    const sentenceResults = sentences.map(s => this.analyzeSentence(s));

    // 汇总统计
    const totalLevelCounts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, SUPER: 0 };
    let totalRank = 0;
    let totalWords = 0;
    let totalUnknown = 0;
    const allNewVocab = new Map();

    for (const result of sentenceResults) {
      for (const level in result.levelCounts) {
        totalLevelCounts[level] += result.levelCounts[level];
      }
      totalRank += result.avgRank * result.totalWords;
      totalWords += result.totalWords;
      totalUnknown += result.unknownWords;

      // 收集所有生词
      for (const v of result.newVocab) {
        const key = v.word;
        if (allNewVocab.has(key)) {
          allNewVocab.get(key).count++;
        } else {
          allNewVocab.set(key, { ...v, count: 1 });
        }
      }
    }

    // 按频率排序生词
    const newVocabList = Array.from(allNewVocab.values())
      .sort((a, b) => {
        // 先按出现次数降序，再按难度升序
        if (b.count !== a.count) return b.count - a.count;
        return this._levelToNum(a.level) - this._levelToNum(b.level);
      })
      .slice(0, 50); // 最多返回50个生词

    // 计算推荐等级（90% 覆盖率）
    const overallGrade = this._computeOverallLevel(totalLevelCounts, totalWords);

    // 计算用户适配度
    const adaptInfo = this._computeAdaptability(totalLevelCounts, totalWords, userLevel);

    return {
      sentences: sentenceResults,
      totalWords,
      totalUnknown,
      levelCounts: totalLevelCounts,
      overallGrade,
      avgRank: Math.round(totalRank / totalWords),
      newVocab: newVocabList,
      userAdaptability: adaptInfo,
    };
  }

  /**
   * 判断用户水平是否适合这段内容
   * @param {VocabVideoResult} report - analyzeVideo 返回的报告
   * @param {string} userLevel - 用户水平（A1-C2）
   * @returns {{suitable: boolean, score: number, message: string}}
   */
  checkFit(report, userLevel) {
    const userLevelNum = this._levelToNum(userLevel);
    const contentLevelNum = this._levelToNum(report.overallGrade);
    const diff = contentLevelNum - userLevelNum;

    if (diff <= 0) {
      return {
        suitable: true,
        score: 100,
        message: `这段内容对你的水平来说偏简单，你可以尝试更高难度的内容。`,
      };
    } else if (diff === 1) {
      return {
        suitable: true,
        score: 75,
        message: `这段内容略高于你的水平，有少量生词，适合作为 i+1 学习材料。`,
      };
    } else if (diff === 2) {
      return {
        suitable: false,
        score: 40,
        message: `这段内容对你的水平来说偏难，建议先提升基础后再学习。`,
      };
    } else {
      return {
        suitable: false,
        score: 10,
        message: `这段内容远超你的当前水平，建议从更基础的内容开始。`,
      };
    }
  }

  /**
   * 直接查询词表等级（不经停用词过滤）
   * 用于沉浸式逐词着色：不依赖 analyzeSentence 的 tokenize 逻辑，
   * 直接用原始 surface form 查表，保证 stopwords 也能查到等级。
   * @param {string} surfaceForm - 未经 normalize 的原始 token（如 "that"、"And"、"he's"）
   * @returns {string|null} 等级字符串（A1/A2/B1/B2/C1/C2）或 null（词表查不到）
   */
  lookupCefrLevelForSurfaceForm(surfaceForm) {
    if (!this.isLoaded) return null;
    const wordInfo = this._lookupWord(surfaceForm);
    if (typeof window !== "undefined") {
      window.__cefrDebug = window.__cefrDebug || {};
      window.__cefrDebug.lastLookup = { surfaceForm, level: wordInfo ? wordInfo.level : null };
      console.debug("[CEFR surfaceLookup]", surfaceForm, "→", wordInfo ? wordInfo.level : "null");
    }
    return wordInfo ? wordInfo.level : null;
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 将 ASR/字幕中常见的不标准写法还原为标准词形（不经 VocabAnalyzer 的 _stripContraction）。
   * 例: "dont" → "do"  |  "cant" → "can"  |  "im" → "i"  |  "wont" → "will"
   * 返回 null 表示不需要还原。
   */
  _normalizeNonstandardContraction(word) {
    const lower = word.toLowerCase();
    const map = {
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
    };
    if (map[lower] !== undefined) return map[lower];
    return null;
  }

  /**
   * 尝试将英语缩写还原为其主词形（仅在直接查表失败时调用）。
   * 例: "weren't" → "were"  |  "it's" → "it"  |  "don't" → "do"
   * 返回 null 表示不可还原（已还原过、数字词等）。
   */
  _stripContraction(word) {
    // 常见 's / 't / 'd / 've / 're / 'll 缩写
    const m = word.match(/^(.+?)n't$/i);
    if (m) {
      const base = m[1].toLowerCase();
      // 特殊映射：won't → will，shan't → shall
      const specialMap = { wont: "will", wonts: "will", wonted: "will" };
      return specialMap[base] || base;
    }
    const m2 = word.match(/^(.+?)'(s|d|m|re|ve|ll)$/i);
    if (m2) {
      return m2[1].toLowerCase();
    }
    return null;
  }

  _initFromData(data) {
    this.vocabData = data;
    // 构建词→信息 的 Map，加速查询
    this.wordMap = new Map(Object.entries(data.words));
    this.isLoaded = true;
    if (typeof window !== "undefined") {
      window.__cefrDebug = window.__cefrDebug || {};
      window.__cefrDebug.wordMapSize = this.wordMap.size;
      window.__cefrDebug.sampleKeys = [...this.wordMap.keys()].slice(0, 5);
      console.debug("[CEFR] vocab loaded, wordMap size:", this.wordMap.size, "sample:", window.__cefrDebug.sampleKeys);
    }
  }

  _lookupWord(word) {
    const lower = word.toLowerCase();
    if (typeof window !== "undefined" && window.__cefrDebug?.enabled) {
      console.debug("[CEFR lookup]", lower);
    }

    // 1. 直接查表
    if (this.wordMap.has(lower)) {
      const info = this.wordMap.get(lower);
      return { word: lower, level: info.level, rank: info.rank, isUnknown: false };
    }

    // 2. 尝试词形还原
    const lemma = this._lemmatize(lower);
    if (lemma !== lower && this.wordMap.has(lemma)) {
      const info = this.wordMap.get(lemma);
      return { word: lemma, level: info.level, rank: info.rank, isUnknown: false, original: lower };
    }

    // 3. 尝试还原不标准缩写（dont→do, cant→can …，不经撇号正则）
    const nonstandard = this._normalizeNonstandardContraction(lower);
    if (nonstandard !== null && nonstandard !== lower && this.wordMap.has(nonstandard)) {
      const info = this.wordMap.get(nonstandard);
      return { word: nonstandard, level: info.level, rank: info.rank, isUnknown: false, original: lower };
    }

    // 4. 尝试还原标准英语缩写（weren't → were, don't → do …）
    const stripped = this._stripContraction(lower);
    if (stripped !== null && stripped !== lower && this.wordMap.has(stripped)) {
      const info = this.wordMap.get(stripped);
      return { word: stripped, level: info.level, rank: info.rank, isUnknown: false, original: lower };
    }

    // 5. 查不到
    return null;
  }

  /**
   * 查询单词的完整信息（含所有词性条目）。
   * 用于需要展示多词性的场景（如词性选择器）。
   * @param {string} word - 英文单词
   * @returns {object|null} 完整词表条目，含 pos_entries；或 null
   */
  getWordInfo(word) {
    const lower = word.toLowerCase();
    // 尝试词形还原链：原文 -> lemma -> 还原缩写
    const candidates = [lower];
    const lemma = this._lemmatize(lower);
    if (lemma !== lower) candidates.push(lemma);
    const stripped = this._stripContraction(lower);
    if (stripped !== null && stripped !== lower) candidates.push(stripped);
    for (const candidate of candidates) {
      if (this.wordMap.has(candidate)) {
        return this.wordMap.get(candidate);
      }
    }
    return null;
  }

  _tokenize(text) {
    // 简单分词：只保留字母，去掉数字、标点、连字符词
    return text
      .replace(/[^a-zA-Z\s']/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.stopwords.has(w.toLowerCase()));
  }

  _computeOverallLevel(levelCounts, totalWords) {
    if (totalWords === 0) return "A1";

    let cumulative = 0;
    const levels = ["C2", "C1", "B2", "B1", "A2", "A1"]; // 从难到易

    for (const level of levels) {
      cumulative += levelCounts[level];
      if (cumulative / totalWords >= 0.9) {
        return level;
      }
    }

    return "C2";
  }

  _findNewVocab(wordResults) {
    // 找出所有不在表里的词（生词/超纲词）
    return wordResults.filter(w => w.isUnknown || w.level === "SUPER");
  }

  _computeAdaptability(levelCounts, totalWords, userLevel) {
    const userLevelNum = this._levelToNum(userLevel);
    const levelOrder = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];

    // 计算用户水平以下的词占比
    let covered = 0;
    for (let i = 0; i < userLevelNum; i++) {
      covered += levelCounts[levelOrder[i]] || 0;
    }

    const coverage = totalWords > 0 ? Math.round(covered / totalWords * 100) : 0;

    return {
      userLevel,
      coverage,
      isSuitable: coverage >= 90,
      message: coverage >= 90
        ? `你的词汇量覆盖了这段内容的 ${coverage}%，非常适合你。`
        : `你的词汇量只覆盖了这段内容的 ${coverage}%，建议先扩充词汇。`,
    };
  }

  _levelToNum(level) {
    const map = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5, SUPER: 6 };
    return map[level] ?? 6;
  }

  _lemmatize(word) {
    // 常见词形还原规则
    const suffixRules = [
      { suffix: "ies", replacement: "y" },      // stories → story
      { suffix: "es", replacement: "" },       // watches → watch
      { suffix: "ed", replacement: "" },       // walked → walk
      { suffix: "ing", replacement: "" },      // walking → walk
      { suffix: "ly", replacement: "" },       // quickly → quick
      { suffix: "ness", replacement: "" },    // happiness → happy
      { suffix: "ment", replacement: "" },    // development → develop
      { suffix: "tion", replacement: "t" },   // education → educat
      { suffix: "s", replacement: "" },        // cats → cat
    ];

    for (const rule of suffixRules) {
      if (word.endsWith(rule.suffix) && word.length > rule.suffix.length + 2) {
        const base = word.slice(0, -rule.suffix.length) + rule.replacement;
        if (this.wordMap.has(base)) {
          return base;
        }
      }
    }

    return word;
  }

  _buildLemmatizationMap() {
    // 常见不规则词形还原映射
    return {
      "ran": "run",
      "won": "win",
      "begun": "begin",
      "written": "write",
      "taken": "take",
      "given": "give",
      "seen": "see",
      "been": "be",
      "gone": "go",
      "come": "come",
      "made": "make",
      "known": "know",
      "thought": "think",
      "told": "tell",
      "found": "find",
      "said": "say",
      "got": "get",
    };
  }

  _buildStopwords() {
    return new Set([
      "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
      "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
      "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
      "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
      "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
      "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
      "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
      "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
      "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
      "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
    ]);
  }
}

// ============================================================
// 导出（兼容 ES Module 和 CommonJS）
// ============================================================
export { VocabAnalyzer };
if (typeof module !== "undefined" && module.exports) {
  module.exports = { VocabAnalyzer };
}
