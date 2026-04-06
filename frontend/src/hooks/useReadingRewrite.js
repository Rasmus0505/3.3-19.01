/**
 * useReadingRewrite.js — 阅读板块 AI 重写状态管理
 * ==============================================
 * Phase 29: AI 重写与路由
 * Phase 32: IndexedDB 持久化（articleId 主键，自动加载，视图偏好记忆）
 * Phase 35: 新流程 — /filter-and-simplify-words
 *   - 词典初筛：提取 i+1 和 >i+1 的词
 *   - DeepSeek 二次筛选：验证词是否有效，过滤过于简单的词
 *   - DeepSeek 重写：将 >i+1 的词重写为 i+1 水平
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseResponse } from "../shared/api/client";
import { readCefrLevel } from "../app/authStorage";
import {
  saveRewriteRecord as dbSave,
  getRewriteRecord,
  updateViewMode as dbUpdateViewMode,
} from "../features/reading/readingRewriteDB";
import { filterAndSimplifyWords, estimateRewriteTokens } from "../features/reading/api/readingRewriteApi";

/* ─── CEFR 等级计算 ──────────────────────────────────── */

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getTargetLevel(userLevel) {
  const userIdx = CEFR_ORDER.indexOf(userLevel);
  const targetIdx = Math.min(userIdx + 1, CEFR_ORDER.length - 1);
  return CEFR_ORDER[targetIdx];
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

/* ─── useReadingRewrite hook ──────────────────────────── */

/**
 * useReadingRewrite — 阅读板块重写状态管理
 *
 * @param {object} props
 * @param {Function} props.apiCall — API 调用函数（来自 LearningShell）
 * @param {string} props.accessToken — 用户 access token
 * @param {string|null} props.articleId — 当前文章 ID（来自 history record.id）
 * @param {Function} props.onSuccess — 重写成功时回调（articleId, rewrittenText）
 */
export function useReadingRewrite({ apiCall, accessToken, articleId, onSuccess }) {
  const [rewrittenText, setRewrittenText] = useState(null);
  const [rewriteMappings, setRewriteMappings] = useState([]);
  // 新流程：区分 i+1 词和 >i+1 词
  const [validI1Words, setValidI1Words] = useState([]);        // 有效的 i+1 词汇
  const [validAboveI1Words, setValidAboveI1Words] = useState([]); // 有效的 >i+1 词汇
  const [removedWords, setRemovedWords] = useState([]);        // 被过滤的词
  const [viewMode, setViewModeState] = useState("original");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);

  // 上一次成功保存到 DB 的 articleId（用于检测文章切换时清空状态）
  const savedArticleIdRef = useRef(null);

  // ── 自动加载：当 articleId 变化时从 IndexedDB 读取 ─────
  useEffect(() => {
    if (!articleId) return;

    let cancelled = false;
    (async () => {
      try {
        const record = await getRewriteRecord(articleId);
        if (cancelled || !record) return;

        // 换了文章但本地还有未保存的状态，先清空
        if (savedArticleIdRef.current !== articleId) {
          setRewrittenText(null);
          setRewriteMappings([]);
          setValidI1Words([]);
          setValidAboveI1Words([]);
          setRemovedWords([]);
          setRewriteError(null);
        }

        savedArticleIdRef.current = articleId;
        setRewrittenText(record.rewrittenText);
        setRewriteMappings(record.mappings || []);
        setValidI1Words(record.validI1Words || []);
        setValidAboveI1Words(record.validAboveI1Words || []);
        setRemovedWords(record.removedWords || []);
        // 若未存过偏好则默认原文（便于先看到 CEFR 标注）
        setViewModeState(record.viewMode || "original");
      } catch (e) {
        console.error("Failed to auto-load rewrite:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const handleSwitchView = useCallback(
    (mode) => {
      if (mode === "rewritten" && !rewrittenText) return;
      setViewModeState(mode);
      // 持久化视图偏好
      if (articleId) {
        dbUpdateViewMode(articleId, mode).catch(console.error);
      }
    },
    [rewrittenText, articleId]
  );

  const clearRewrite = useCallback(() => {
    setRewrittenText(null);
    setRewriteMappings([]);
    setValidI1Words([]);
    setValidAboveI1Words([]);
    setRemovedWords([]);
    setRewriteError(null);
    setViewModeState("original");
  }, []);

  /**
   * 处理文章重写
   * @param {string} originalText — 原始文章全文
   * @param {{ words: Array<{word: string, level: string}>, wordLevels: object }} options
   *   - words: 词典筛选出的候选词 [{word, level}]
   *   - wordLevels: 词典标注的等级 {word: level}
   */
  const handleRewrite = useCallback(
    async (originalText, { words, wordLevels } = {}) => {
      // ── 新流程 Step 2：DeepSeek 二次筛选 + 重写 ─────────────
      const { toast } = await import("sonner");

      if (!accessToken) {
        const msg = "请先登录后再使用 AI 重写";
        toast.error(msg);
        setRewriteError(msg);
        return;
      }
      if (!apiCall) {
        const devHint =
          import.meta.env.DEV
            ? "（开发）ReadingPage 未收到 apiCall，请在 LearningShellPanelContent 中传入 apiCall={apiCall}"
            : "";
        const msg = "未接入请求接口" + (devHint ? " " + devHint : "");
        toast.error("无法发起重写：" + msg, { duration: import.meta.env.DEV ? 12000 : 6000 });
        setRewriteError(msg);
        return;
      }

      setIsRewriting(true);
      setRewriteError(null);

      try {
        const userLevel = readCefrLevel() || "B1";
        const targetLevel = getTargetLevel(userLevel);

        // 如果没有传入候选词，生成空结果
        if (!words || words.length === 0) {
          toast.info("当前没有需要处理的高难度词");
          setRewrittenText(originalText);
          setRewriteMappings([]);
          setValidI1Words([]);
          setValidAboveI1Words([]);
          setRemovedWords([]);
          setViewModeState("original");
          if (articleId) {
            await dbSave({
              articleId,
              originalText,
              rewrittenText: originalText,
              mappings: [],
              validI1Words: [],
              validAboveI1Words: [],
              removedWords: [],
              wordLevels: {},
              viewMode: "original",
              rewrittenAt: Date.now(),
            });
            savedArticleIdRef.current = articleId;
            onSuccess?.(articleId, originalText);
          }
          return;
        }

        // 估算 token 消耗，显示给用户
        try {
          const est = await estimateRewriteTokens(originalText, accessToken);
          toast.info(
            `预计消耗 ${est.estimatedChargeYuan.toFixed(2)} 元（约 ${est.estimatedTokens} tokens）`,
            { duration: 4000 }
          );
        } catch (e) {
          console.warn("Token estimation failed:", e);
        }

        // 调用 DeepSeek 二次筛选 + 重写
        const result = await filterAndSimplifyWords(
          originalText,
          words.map((w) => w.word),
          wordLevels || {},
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

        const chargeYuan = (result.chargeCents || 0) / 100;
        toast.success(
          "处理完成" +
            (chargeYuan > 0 ? `，消耗 ${chargeYuan.toFixed(2)} 元` : "") +
            (dsRemoved.length > 0 ? `（过滤 ${dsRemoved.length} 个过于简单的词）` : "")
        );

        // Step 3: 本地按顺序替换 >i+1 词 → 生成重写文本
        const rewrittenText = applySimplifiedWords(originalText, dsValidAboveI1, simplifiedWords);

        // Step 4: 构建 rewriteMappings（用于重写版渲染）
        const newMappings = [];
        dsValidAboveI1.forEach((word, i) => {
          const replacement = simplifiedWords[i];
          if (replacement && replacement !== "") {
            newMappings.push({
              original: preserveCase(word, replacement), // 重写版显示的词形
              originalLower: word.toLowerCase(),         // 原文视图匹配用
              rewritten: word,                           // 原文词（tooltip 用）
              confirmed: true,
              dsLevel: dsWordLevels[word.toLowerCase()] || "B2",
            });
          } else {
            newMappings.push({
              original: word,
              originalLower: word.toLowerCase(),
              rewritten: word,
              confirmed: false,
              dsLevel: dsWordLevels[word.toLowerCase()] || "B2",
            });
          }
        });

        // Step 5: 保存到 IndexedDB
        if (articleId) {
          await dbSave({
            articleId,
            originalText,
            rewrittenText,
            mappings: newMappings,
            validI1Words: dsValidI1,
            validAboveI1Words: dsValidAboveI1,
            removedWords: dsRemoved,
            wordLevels: dsWordLevels,
            viewMode: "original",
            rewrittenAt: Date.now(),
          });
          savedArticleIdRef.current = articleId;
          onSuccess?.(articleId, rewrittenText);
        }

        // 更新状态
        setRewrittenText(rewrittenText);
        setRewriteMappings(newMappings);
        setValidI1Words(dsValidI1);
        setValidAboveI1Words(dsValidAboveI1);
        setRemovedWords(dsRemoved);
        setViewModeState("original");
      } catch (err) {
        const msg = err?.message || "网络错误";
        toast.error("重写失败：" + msg);
        setRewriteError(msg);
      } finally {
        setIsRewriting(false);
      }
    },
    [accessToken, apiCall, articleId, onSuccess]
  );

  return {
    rewrittenText,
    rewriteMappings,
    validI1Words,
    validAboveI1Words,
    removedWords,
    viewMode,
    setViewMode: handleSwitchView,
    isRewriting,
    rewriteError,
    clearRewrite,
    handleRewrite,
  };
}
