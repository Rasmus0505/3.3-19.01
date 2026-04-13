/**
 * useVocabularyFilter.js — 词汇筛选与简化 Hook
 * ==============================================
 * 整合三步处理流程：
 * 1. 本地词典初筛（VocabAnalyzer）- 由调用方完成
 * 2. DeepSeek 二次筛选（filterAndSimplifyWords API）
 * 3. 构建 rewriteMappings 供 ArticlePanel 使用
 *
 * @param {object} params
 * @param {string|null} params.accessToken - 用户 access token
 * @param {string} [params.userLevel="B1"] - 用户当前 CEFR 等级
 * @param {string} [params.targetLevel="B2"] - 目标 CEFR 等级 (i+1)
 */
import { useCallback, useState } from "react";
import { filterAndSimplifyWords } from "./api/readingRewriteApi";

/* ─── CEFR 等级常量 ──────────────────────────────────── */

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * 根据用户等级计算目标等级 (i+1)
 * @param {string} userLevel
 * @returns {string}
 */
export function getTargetLevel(userLevel) {
  const userIdx = CEFR_ORDER.indexOf(userLevel);
  const targetIdx = Math.min(userIdx + 1, CEFR_ORDER.length - 1);
  return CEFR_ORDER[targetIdx];
}

/* ─── 辅助函数 ───────────────────────────────────────── */

/**
 * 转义正则表达式特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 保持原文首字母大写规则
 * @param {string} originalWord - 原文词形
 * @param {string} replacement - 替换词
 * @returns {string}
 */
function preserveCase(originalWord, replacement) {
  if (!originalWord || !replacement) return replacement || "";
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
 * @param {string[]} words - 原始高难度词列表（按顺序）
 * @param {string[]} replacements - 简化词列表（按顺序，与 words 一一对应）
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
    const escaped = escapeRegex(rawWord);
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, (match) => preserveCase(match, replacement));
  });
  return result;
}

/* ─── Hook ───────────────────────────────────────────── */

/**
 * useVocabularyFilter - 词汇筛选与简化 Hook
 *
 * @returns {{
 *   isProcessing: boolean,
 *   error: string|null,
 *   originalText: string,
 *   rewrittenText: string,
 *   validI1Words: string[],
 *   validAboveI1Words: string[],
 *   removedWords: Array<{word: string, reason: string}>,
 *   rewriteMappings: Array<{original: string, originalLower: string, rewritten: string, confirmed: boolean, dsLevel: string}>,
 *   wordLevels: object,
 *   processArticle: (text: string, candidateWords: Array<{word: string, cefrLevel: string}>) => Promise<{success: boolean, rewrittenText?: string, error?: string}>,
 *   reset: () => void
 * }}
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

  /**
   * 处理文章：调用 DeepSeek 二次筛选并构建 rewriteMappings
   * @param {string} text - 原文
   * @param {Array<{word: string, cefrLevel: string}>} candidateWords - 词典分析结果
   * @returns {Promise<{success: boolean, rewrittenText?: string, error?: string}>}
   */
  const processArticle = useCallback(async (text, candidateWords) => {
    // 参数校验
    if (!text || typeof text !== "string") {
      const msg = "原文不能为空";
      setError(msg);
      return { success: false, error: msg };
    }

    if (!accessToken) {
      const msg = "缺少 accessToken，请先登录";
      setError(msg);
      return { success: false, error: msg };
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

    setIsProcessing(true);
    setError(null);
    setOriginalText(text);

    try {
      // 准备 API 调用参数
      const words = candidateWords.map((w) => w.word);
      const wordLevelsMap = {};
      candidateWords.forEach((w) => {
        wordLevelsMap[w.word.toLowerCase()] = w.cefrLevel || "B2";
      });

      // 调用 DeepSeek 二次筛选 API
      const result = await filterAndSimplifyWords(
        text,
        words,
        wordLevelsMap,
        targetLevel,
        userLevel,
        accessToken,
        false // enableThinking
      );

      const {
        validI1Words: dsValidI1,
        validAboveI1Words: dsValidAboveI1,
        removedWords: dsRemoved,
        simplifiedWords,
        wordLevels: dsWordLevels,
      } = result;

      // 应用简化替换，生成重写文本
      const rewritten = applySimplifiedWords(text, dsValidAboveI1, simplifiedWords);

      // 构建 rewriteMappings 数组（用于 ArticlePanel 渲染）
      const mappings = dsValidAboveI1.map((word, i) => {
        const replacement = simplifiedWords[i];
        const isConfirmed = replacement && replacement !== "";
        const originalLower = word.toLowerCase();

        return {
          original: isConfirmed ? preserveCase(word, replacement) : word,
          originalLower,
          rewritten: word,
          confirmed: isConfirmed,
          dsLevel: dsWordLevels[originalLower] || targetLevel,
        };
      });

      // 更新状态
      setRewrittenText(rewritten);
      setValidI1Words(dsValidI1);
      setValidAboveI1Words(dsValidAboveI1);
      setRemovedWords(dsRemoved);
      setRewriteMappings(mappings);
      setWordLevels(dsWordLevels);

      return { success: true, rewrittenText: rewritten };
    } catch (err) {
      const msg = err?.message || "处理失败，请重试";
      setError(msg);
      console.error("VocabularyFilter error:", err);
      return { success: false, error: msg };
    } finally {
      setIsProcessing(false);
    }
  }, [accessToken, userLevel, targetLevel]);

  /**
   * 重置所有状态
   */
  const reset = useCallback(() => {
    setIsProcessing(false);
    setError(null);
    setOriginalText("");
    setRewrittenText("");
    setValidI1Words([]);
    setValidAboveI1Words([]);
    setRemovedWords([]);
    setRewriteMappings([]);
    setWordLevels({});
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
