/**
 * useVocabularyFilter.js — 词汇筛选 Hook
 * ======================================
 * Phase 36: 阅读板块词汇简化功能重构
 *
 * 整合三步处理流程：
 * 1. 本地词典初筛（调用方负责，传入候选词）
 * 2. DeepSeek 二次筛选（filterAndSimplifyWords API）
 * 3. 构建 rewriteMappings 供渲染使用
 */
import { useState, useCallback, useRef } from "react";
import { filterAndSimplifyWords } from "./api/readingRewriteApi";

/**
 * 转义正则特殊字符
 * @param {string} string
 * @returns {string}
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 保持原文首字母大写规则
 * @param {string} originalWord — 原文词形
 * @param {string} replacement — 替换词
 * @returns {string}
 */
function preserveCase(originalWord, replacement) {
  if (!originalWord || !replacement) return replacement;
  // 全大写
  if (originalWord === originalWord.toUpperCase()) {
    return replacement.toUpperCase();
  }
  // 首字母大写
  if (
    originalWord.charAt(0) === originalWord.charAt(0).toUpperCase() &&
    originalWord.slice(1) === originalWord.slice(1).toLowerCase()
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

/**
 * 将原文中的 >i+1 词按顺序替换为简化词
 * 使用单词边界正则，避免部分匹配
 * @param {string} originalText
 * @param {string[]} words — 原始高难度词列表（按顺序）
 * @param {string[]} replacements — 简化词列表（按顺序，与 words 一一对应）
 * @returns {string}
 */
function applySimplifiedWords(originalText, words, replacements) {
  if (!words || words.length === 0) return originalText;
  let result = originalText;
  words.forEach((rawWord, i) => {
    const replacement = replacements[i];
    if (replacement === "" || replacement == null) {
      return; // 跳过，原文保留
    }
    const escaped = rawWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, replacement);
  });
  return result;
}

/**
 * useVocabularyFilter — 词汇筛选 Hook
 *
 * @param {object} props
 * @param {string} props.accessToken — 用户 access token
 * @param {string} [props.userLevel="B1"] — 用户 CEFR 等级
 * @param {string} [props.targetLevel="B2"] — 目标 CEFR 等级 (i+1)
 */
export function useVocabularyFilter({ accessToken, userLevel = "B1", targetLevel = "B2" }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // 处理结果状态
  const [originalText, setOriginalText] = useState("");
  const [rewrittenText, setRewrittenText] = useState("");
  const [validI1Words, setValidI1Words] = useState([]);
  const [validAboveI1Words, setValidAboveI1Words] = useState([]);
  const [removedWords, setRemovedWords] = useState([]);
  const [rewriteMappings, setRewriteMappings] = useState([]);
  const [wordLevels, setWordLevels] = useState({});

  const abortRef = useRef(null);

  /**
   * 处理文章
   * @param {string} text — 原始文章文本
   * @param {Array<{word: string, level: string}>} candidateWords — 词典筛选出的候选词
   * @returns {Promise<{success: boolean, rewrittenText?: string, error?: string}>}
   */
  const processArticle = useCallback(async (text, candidateWords) => {
    if (!text?.trim()) {
      setError("文章为空");
      return { success: false, error: "文章为空" };
    }
    if (!candidateWords?.length) {
      // 没有候选词，直接返回原文
      setOriginalText(text);
      setRewrittenText(text);
      setValidI1Words([]);
      setValidAboveI1Words([]);
      setRemovedWords([]);
      setRewriteMappings([]);
      setWordLevels({});
      setError(null);
      return { success: true, rewrittenText: text };
    }

    if (!accessToken) {
      const msg = "请先登录";
      setError(msg);
      return { success: false, error: msg };
    }

    setIsProcessing(true);
    setError(null);

    try {
      // 提取词列表和等级映射
      const words = candidateWords.map((c) => c.word);
      const wordLevelsMap = {};
      candidateWords.forEach((c) => {
        wordLevelsMap[c.word.toLowerCase()] = c.level || "B2";
      });

      // 调用 API
      const result = await filterAndSimplifyWords(
        text,
        words,
        wordLevelsMap,
        targetLevel,
        userLevel,
        accessToken,
        false
      );

      const {
        validI1Words: dsValidI1,
        validAboveI1Words: dsValidAboveI1,
        removedWords: dsRemoved,
        simplifiedWords,
        wordLevels: dsWordLevels,
      } = result;

      // 更新状态
      setOriginalText(text);
      setValidI1Words(dsValidI1);
      setValidAboveI1Words(dsValidAboveI1);
      setRemovedWords(dsRemoved);
      setWordLevels(dsWordLevels);

      // 构建 rewriteMappings（用于重写版渲染）
      const mappings = [];
      dsValidAboveI1.forEach((word, i) => {
        const replacement = simplifiedWords[i];
        if (replacement && replacement !== "") {
          mappings.push({
            original: preserveCase(word, replacement), // 重写版显示的词形
            originalLower: word.toLowerCase(),          // 原文视图匹配用
            rewritten: word,                            // 原文词（tooltip 用）
            confirmed: true,
            dsLevel: dsWordLevels[word.toLowerCase()] || "B2",
          });
        } else {
          mappings.push({
            original: word,
            originalLower: word.toLowerCase(),
            rewritten: word,
            confirmed: false,
            dsLevel: dsWordLevels[word.toLowerCase()] || "B2",
          });
        }
      });
      setRewriteMappings(mappings);

      // 生成重写版文本
      const rewritten = applySimplifiedWords(text, dsValidAboveI1, simplifiedWords);
      setRewrittenText(rewritten);

      return { success: true, rewrittenText: rewritten };
    } catch (err) {
      const msg = err?.message || "处理失败";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsProcessing(false);
    }
  }, [accessToken, userLevel, targetLevel]);

  /**
   * 重置所有状态
   */
  const reset = useCallback(() => {
    setOriginalText("");
    setRewrittenText("");
    setValidI1Words([]);
    setValidAboveI1Words([]);
    setRemovedWords([]);
    setRewriteMappings([]);
    setWordLevels({});
    setError(null);
  }, []);

  return {
    // 状态
    isProcessing,
    error,
    originalText,
    rewrittenText,
    validI1Words,
    validAboveI1Words,
    removedWords,
    rewriteMappings,
    wordLevels,
    // 方法
    processArticle,
    reset,
  };
}

export default useVocabularyFilter;