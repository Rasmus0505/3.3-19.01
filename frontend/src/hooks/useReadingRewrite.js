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
 * @param {string[]} words — 原始高难度词（按顺序）
 * @param {string[]} replacements — 简化词（按顺序）
 * @returns {string}
 */
function applySimplifiedWords(originalText, words, replacements) {
  if (!words || words.length === 0) return originalText;
  let result = originalText;
  words.forEach((word, i) => {
    const replacement = replacements[i] || word;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
        // 如果存储了 viewMode 使用它；否则默认显示重写版
        setViewModeState(record.viewMode || "rewritten");
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
    async (originalText) => {
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

        // Step 1: 估算 token 消耗，显示给用户（不阻塞主流程）
        try {
          const est = await estimateRewriteTokens(originalText, accessToken);
          toast.info(
            `预计消耗 ${est.estimatedChargeYuan.toFixed(2)} 元（约 ${est.estimatedTokens} tokens）`,
            { duration: 4000 }
          );
        } catch (e) {
          console.warn("Token estimation failed:", e);
        }

        // Step 2: 从 rewriteMappings 提取需要简化的原始词列表（按顺序）
        // Phase 34 新 Schema：只简化 rewriteMappings 中记录的词
        const wordsToSimplify = extractHighDiffWordsFromMappings(rewriteMappings);

        let rewrittenText = originalText;

        // Step 3: 如果有高难度词，调用 /simplify-words
        if (wordsToSimplify.length > 0) {
          const result = await simplifyWords(
            originalText,
            wordsToSimplify,
            targetLevel,
            accessToken,
            false
          );
          const simplifiedWords = result.simplifiedWords;
          const chargeYuan = (result.chargeCents || 0) / 100;
          toast.success("简化完成" + (chargeYuan > 0 ? "，消耗 " + chargeYuan.toFixed(2) + " 元" : ""));

          // Step 4: 本地按顺序替换高难度词 → 生成重写文本
          rewrittenText = applySimplifiedWords(originalText, wordsToSimplify, simplifiedWords);

          // Step 5: 保存到 IndexedDB
          const newMappings = wordsToSimplify.map((w, i) => ({
            original: w,
            rewritten: simplifiedWords[i] || w,
          }));

          if (articleId) {
            await dbSave({
              articleId,
              originalText,
              rewrittenText,
              mappings: newMappings,
              viewMode: "rewritten",
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
              viewMode: "rewritten",
              rewrittenAt: Date.now(),
            });
            savedArticleIdRef.current = articleId;
            onSuccess?.(articleId, rewrittenText);
          }
          setRewrittenText(rewrittenText);
          setRewriteMappings([]);
        }

        setViewModeState("rewritten");
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
