/**
 * useReadingRewrite.js — 阅读板块 AI 重写状态管理
 * ==============================================
 * Phase 29: AI 重写与路由
 * Phase 32: IndexedDB 持久化（articleId 主键，自动加载，视图偏好记忆）
 * Phase 34: Prompt Optimization — 新 Schema：/simplify-words + 本地词替换
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseResponse } from "../shared/api/client";
import { readCefrLevel } from "../app/authStorage";
import {
  saveRewriteRecord as dbSave,
  getRewriteRecord,
  updateViewMode as dbUpdateViewMode,
} from "../features/reading/readingRewriteDB";
import { simplifyWords, estimateRewriteTokens } from "../features/reading/api/readingRewriteApi";

/* ─── CEFR 等级计算 ──────────────────────────────────── */

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getTargetLevel(userLevel) {
  const userIdx = CEFR_ORDER.indexOf(userLevel);
  const targetIdx = Math.min(userIdx + 1, CEFR_ORDER.length - 1);
  return CEFR_ORDER[targetIdx];
}

/**
 * 从 rewriteMappings 提取需要简化的原始词列表（按顺序）
 * @param {Array<{original: string, rewritten: string}>} mappings
 * @returns {string[]}
 */
function extractHighDiffWordsFromMappings(mappings) {
  if (!mappings || mappings.length === 0) return [];
  return mappings.map((m) => m.original);
}

/**
 * 将原文中的高难度词按顺序替换为简化词
 * 使用单词边界正则，避免部分匹配
 * @param {string} originalText
 * @param {{ word: string }[]} words — 原始高难度词（按顺序，格式：{ word: 原文词形 }）
 * @param {string[]} replacements — 简化词（按顺序）
 * @returns {string}
 */
function applySimplifiedWords(originalText, words, replacements) {
  if (!words || words.length === 0) return originalText;
  let result = originalText;
  words.forEach((w, i) => {
    const replacement = replacements[i];
    if (replacement === "" || replacement == null) {
      return; // 跳过，原文保留
    }
    // 使用原文词形（w.word）而非 lemma，确保替换的是原文实际出现的词形
    const rawWord = typeof w === "string" ? w : w.word;
    const escaped = rawWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, replacement);
  });
  return result;
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
          setRewriteError(null);
        }

        savedArticleIdRef.current = articleId;
        setRewrittenText(record.rewrittenText);
        setRewriteMappings(record.mappings || []);
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
    setRewriteError(null);
    setViewModeState("original");
  }, []);

  const handleRewrite = useCallback(
    async (originalText, { wordsToSimplify: explicitWords } = {}) => {
      // ── Phase 34 新流程：识别高难度词 → 简化 → 本地替换 ─────────────
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

        // Step 2: 取词优先级：① 外部显式传入 → ② rewriteMappings（增量重写场景）
        // 注意：ReadingPage 传 {word, level}[]，rewriteMappings 是 {original}[]（旧格式无等级）
        const rawWordsToSimplify = explicitWords && explicitWords.length > 0
          ? explicitWords
          : extractHighDiffWordsFromMappings(rewriteMappings);

        // 判断是否为新格式 {word, level}[]
        const isNewFormat = rawWordsToSimplify.length > 0 && typeof rawWordsToSimplify[0] === "object" && "word" in rawWordsToSimplify[0];
        const wordsToSimplify = isNewFormat ? rawWordsToSimplify : rawWordsToSimplify.map(w => ({ word: w }));

        // 构建 wordLevels dict
        const wordLevels = {};
        wordsToSimplify.forEach(w => {
          wordLevels[w.word.toLowerCase()] = w.level || "B2";
        });
        const words = wordsToSimplify.map(w => w.word);

        let rewrittenText = originalText;

        // Step 3: 如果有高难度词，调用 /simplify-words
        if (wordsToSimplify.length > 0) {
          // Step 3a: 估算 token 消耗，显示给用户（仅在有待简化词时）
          try {
            const est = await estimateRewriteTokens(originalText, accessToken);
            toast.info(
              `预计消耗 ${est.estimatedChargeYuan.toFixed(2)} 元（约 ${est.estimatedTokens} tokens）`,
              { duration: 4000 }
            );
          } catch (e) {
            console.warn("Token estimation failed:", e);
          }

          const result = await simplifyWords(
            originalText,
            words,
            targetLevel,
            accessToken,
            false,
            wordLevels
          );
          const simplifiedWords = result.simplifiedWords;
          const dsWordLevels = result.wordLevels || {};  // DeepSeek 判断的 CEFR 等级
          const chargeYuan = (result.chargeCents || 0) / 100;
          toast.success("简化完成" + (chargeYuan > 0 ? "，消耗 " + chargeYuan.toFixed(2) + " 元" : ""));

          // Step 4: 本地按顺序替换高难度词 → 生成重写文本
          rewrittenText = applySimplifiedWords(originalText, wordsToSimplify, simplifiedWords);

          // Step 5: 保存到 IndexedDB（过滤空替换）
          const newMappings = [];
          wordsToSimplify.forEach((w, i) => {
            const rewritten = simplifiedWords[i];
            if (rewritten && rewritten !== "") {
              newMappings.push({
                original: w.word,
                rewritten,
                confirmed: true,
                originalLevel: w.level || "B2",
                dsLevel: dsWordLevels[w.word.toLowerCase()] || w.level || "B2",  // DeepSeek 判断的等级
              });
            } else {
              // DeepSeek 判定不需要简化（返回 ""），词典等级过低
              newMappings.push({
                original: w.word,
                rewritten: w.word, // 本地不做替换
                confirmed: false,
                originalLevel: w.level || "B2",
                dsLevel: dsWordLevels[w.word.toLowerCase()] || w.level || "B2",  // DeepSeek 判断的等级
              });
            }
          });

          if (articleId) {
            await dbSave({
              articleId,
              originalText,
              rewrittenText,
              mappings: newMappings,
              viewMode: "original",
              rewrittenAt: Date.now(),
            });
            savedArticleIdRef.current = articleId;
            onSuccess?.(articleId, rewrittenText);
          }

          setRewrittenText(rewrittenText);
          setRewriteMappings(newMappings);
        } else {
          // 无高难度词时，跳过 API 调用，原文即重写版
          toast.info("当前没有需要简化的高难度词");
          rewrittenText = originalText;
          if (articleId) {
            await dbSave({
              articleId,
              originalText,
              rewrittenText,
              mappings: [],
              viewMode: "original",
              rewrittenAt: Date.now(),
            });
            savedArticleIdRef.current = articleId;
            onSuccess?.(articleId, rewrittenText);
          }
          setRewrittenText(rewrittenText);
          setRewriteMappings([]);
        }

        setViewModeState("original");
      } catch (err) {
        const msg = err?.message || "网络错误";
        toast.error("重写失败：" + msg);
        setRewriteError(msg);
      } finally {
        setIsRewriting(false);
      }
    },
    [accessToken, apiCall, articleId, rewriteMappings]
  );

  return {
    rewrittenText,
    rewriteMappings,
    viewMode,
    setViewMode: handleSwitchView,
    isRewriting,
    rewriteError,
    clearRewrite,
    handleRewrite,
  };
}

/* ─── 历史遗留导出（兼容旧调用方） ────────────────────── */
// eslint-disable-next-line no-unused-vars
const _deprecated = null; // 原 saveRewriteRecord/getRewriteRecordById/getLatestRewriteRecord 已移除，请使用 readingRewriteDB.js
