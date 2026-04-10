/**
 * useReadingRewrite.js — 阅读板块 AI 重写状态管理
 * ==============================================
 * Phase 29: AI 重写与路由
 * Phase 32: IndexedDB 持久化（articleId 主键，自动加载，视图偏好记忆）
 * Phase 36: 词形还原版流程
 *   - Step 1: surface form 首筛：提取 >= i+1 的词
 *   - Step 2: /extract-lemmas → 返回原型词列表
 *   - Step 3: 本地词典二次判断 final_level
 *   - Step 4: 仅把 >i+1 词发给 /simplify-words
 *   - Step 5: 下划线/tooltip/重写统一基于 final_level
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readCefrLevel } from "../app/authStorage";
import {
  saveRewriteRecord as dbSave,
  getRewriteRecord,
  updateViewMode as dbUpdateViewMode,
} from "../features/reading/readingRewriteDB";
import { simplifyWords, estimateRewriteTokens, extractLemmas } from "../features/reading/api/readingRewriteApi";
import { getOrCreateAnalyzer } from "../utils/vocabAnalyzer";

/* ─── CEFR 等级计算 ──────────────────────────────────── */

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function _levelToNum(level) {
  const idx = CEFR_ORDER.indexOf(level);
  return idx >= 0 ? idx : CEFR_ORDER.length;
}

function getTargetLevel(userLevel) {
  const userIdx = CEFR_ORDER.indexOf(userLevel);
  const targetIdx = Math.min(userIdx + 1, CEFR_ORDER.length - 1);
  return CEFR_ORDER[targetIdx];
}

function toUniqueLowerWordList(words = []) {
  const seen = new Set();
  const out = [];
  for (const word of words) {
    const normalized = String(word || "").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
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
  const [wordLevels, setWordLevels] = useState({});            // 二次筛选后的最终等级
  const [viewMode, setViewModeState] = useState("original");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);
  const [diagnosticSnapshot, setDiagnosticSnapshot] = useState(null);
  const [flowStatus, setFlowStatus] = useState("idle");

  // 上一次成功保存到 DB 的 articleId（用于检测文章切换时清空状态）
  const savedArticleIdRef = useRef(null);

  // ── 自动加载：当 articleId 变化时从 IndexedDB 读取 ─────
  useEffect(() => {
    if (!articleId) return;

    let cancelled = false;
    (async () => {
      try {
        const record = await getRewriteRecord(articleId);
        if (savedArticleIdRef.current !== articleId) {
          setRewrittenText(null);
          setRewriteMappings([]);
          setValidI1Words([]);
          setValidAboveI1Words([]);
          setRemovedWords([]);
          setWordLevels({});
          setDiagnosticSnapshot(null);
          setFlowStatus("idle");
          setRewriteError(null);
          setViewModeState("original");
        }
        if (cancelled || !record) return;

        savedArticleIdRef.current = articleId;
        setRewrittenText(record.rewrittenText);
        setRewriteMappings(record.mappings || []);
        setValidI1Words(record.validI1Words || []);
        setValidAboveI1Words(record.validAboveI1Words || []);
        setRemovedWords(record.removedWords || []);
        setWordLevels(record.wordLevels || {});
        setDiagnosticSnapshot(record.diagnosticSnapshot || null);
        setFlowStatus(
          record.flowStatus ||
            (record.rewrittenText ? "generated" : record.diagnosticSnapshot ? "diagnosed" : "idle")
        );
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
    setWordLevels({});
    setRewriteError(null);
    setDiagnosticSnapshot(null);
    setFlowStatus("idle");
    setViewModeState("original");
  }, []);

  const persistRecord = useCallback(
    async (patch) => {
      const resolvedArticleId = patch.articleId ?? articleId;
      if (!resolvedArticleId) return null;
      const existing = (await getRewriteRecord(resolvedArticleId)) || {};
      const nextRecord = {
        articleId: resolvedArticleId,
        originalText: patch.originalText ?? existing.originalText ?? "",
        rewrittenText: patch.rewrittenText ?? existing.rewrittenText ?? null,
        mappings: patch.mappings ?? existing.mappings ?? [],
        validI1Words: patch.validI1Words ?? existing.validI1Words ?? [],
        validAboveI1Words: patch.validAboveI1Words ?? existing.validAboveI1Words ?? [],
        removedWords: patch.removedWords ?? existing.removedWords ?? [],
        wordLevels: patch.wordLevels ?? existing.wordLevels ?? {},
        diagnosticSnapshot: patch.diagnosticSnapshot ?? existing.diagnosticSnapshot ?? null,
        flowStatus: patch.flowStatus ?? existing.flowStatus ?? "idle",
        viewMode: patch.viewMode ?? existing.viewMode ?? "original",
        rewrittenAt: patch.rewrittenAt ?? existing.rewrittenAt ?? Date.now(),
      };
      await dbSave(nextRecord);
      savedArticleIdRef.current = resolvedArticleId;
      return nextRecord;
    },
    [articleId]
  );

  const saveDiagnosticSnapshot = useCallback(
    async ({ articleId: articleIdOverride = null, originalText, snapshot }) => {
      setDiagnosticSnapshot(snapshot);
      setFlowStatus("diagnosed");
      setRewriteError(null);
      setViewModeState("original");
      await persistRecord({
        articleId: articleIdOverride,
        originalText,
        diagnosticSnapshot: snapshot,
        flowStatus: "diagnosed",
        rewrittenText: null,
        mappings: [],
        validI1Words: [],
        validAboveI1Words: [],
        removedWords: [],
        wordLevels: {},
        viewMode: "original",
      });
      onSuccess?.(articleIdOverride || articleId, snapshot);
    },
    [articleId, onSuccess, persistRecord]
  );

  /**
   * 处理文章重写
   * 新流程 (Phase 36):
   *   Step 1: 词典初筛（调用方已传入 words）
   *   Step 2: /extract-lemmas → 获取原型词列表
   *   Step 3: 词典二次判断原型等级（前端本地查词表，产出 final_level）
   *   Step 4: 仅把 >i+1 词发给 /simplify-words
   *   Step 5: 原文高亮、tooltip、重写都基于 final_level
   * @param {string} originalText — 原始文章全文
   * @param {{ words: Array<{word: string, level: string}> }} options
   */
  const handleRewrite = useCallback(
    async (originalText, { words, targetLevel: targetLevelOverride = null, showEstimateToast = true } = {}) => {
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
        const targetLevel = targetLevelOverride || getTargetLevel(userLevel);

        // 如果没有传入候选词，生成空结果
        if (!words || words.length === 0) {
          toast.info("当前没有需要处理的高难度词");
          setRewrittenText(originalText);
            setRewriteMappings([]);
            setValidI1Words([]);
            setValidAboveI1Words([]);
            setRemovedWords([]);
            setWordLevels({});
            setFlowStatus("generated");
            setViewModeState("original");
            if (articleId) {
              await persistRecord({
                originalText,
                rewrittenText: originalText,
                mappings: [],
                validI1Words: [],
                validAboveI1Words: [],
                removedWords: [],
                wordLevels: {},
                flowStatus: "generated",
                viewMode: "original",
                rewrittenAt: Date.now(),
              });
              onSuccess?.(articleId, originalText);
          }
          return;
        }

        // 估算 token 消耗
        if (showEstimateToast) {
          try {
            const est = await estimateRewriteTokens(originalText, accessToken);
            toast.info(
              `预计消耗 ${est.estimatedChargeYuan.toFixed(2)} 元（约 ${est.estimatedTokens} tokens）`,
              { duration: 4000 }
            );
          } catch (e) {
            console.warn("Token estimation failed:", e);
          }
        }

        // ── Step 2: 调用 LLM 提取原型词 ───────────────────────────
        const originalWords = words.map((w) => w.word);
        let lemmasResult;
        try {
          lemmasResult = await extractLemmas(originalText, originalWords, accessToken);
        } catch (e) {
          toast.error("原型提取失败：" + (e?.message || "请稍后重试"));
          setRewriteError(e?.message || "原型提取失败");
          return;
        }
        const { lemmas } = lemmasResult;

        // ── Step 3: 词典二次判断原型等级 ─────────────────────────
        const analyzer = await getOrCreateAnalyzer();
        const validI1WordsList = [];
        const validAboveI1WordsList = [];
        const removedByLemmaWordsList = [];
        const finalWordLevels = {};
        const userLevelNum = _levelToNum(userLevel);
        const targetLevelNum = _levelToNum(targetLevel);

        for (let i = 0; i < words.length; i++) {
          const originalWord = words[i].word;
          const lemma = lemmas[i] || originalWord.toLowerCase();
          const surfaceLevel = String(words[i].level || "");
          const finalLevel =
            analyzer.lookupCefrLevelForDictionaryForm(lemma) ||
            surfaceLevel ||
            null;
          const originalLower = originalWord.toLowerCase();
          finalWordLevels[originalLower] = finalLevel || "";

          const finalLevelNum = _levelToNum(finalLevel);

          if (finalLevelNum <= userLevelNum) {
            removedByLemmaWordsList.push({
              word: originalWord,
              lemma,
              finalLevel: finalLevel || "unknown",
              reason: `原型 "${lemma}" 最终等级为 ${finalLevel || "unknown"}，低于等于用户等级 ${userLevel}`,
            });
          } else if (finalLevelNum === targetLevelNum) {
            validI1WordsList.push(originalWord);
          } else {
            validAboveI1WordsList.push(originalWord);
          }
        }

        let simplifiedWords = [];
        let finalAboveI1Words = validAboveI1WordsList;
        const finalRemoved = [...removedByLemmaWordsList];

        if (validAboveI1WordsList.length > 0) {
          const aboveWordLevels = {};
          validAboveI1WordsList.forEach((word) => {
            aboveWordLevels[word.toLowerCase()] = finalWordLevels[word.toLowerCase()] || targetLevel;
          });

          try {
            const result = await simplifyWords(
              originalText,
              validAboveI1WordsList,
              targetLevel,
              accessToken,
              false,
              aboveWordLevels,
            );
            simplifiedWords = result.simplifiedWords || [];
          } catch (e) {
            toast.error("重写失败：" + (e?.message || "请稍后重试"));
            setRewriteError(e?.message || "重写失败");
            return;
          }
        }

        toast.success(
          "处理完成" +
            (validI1WordsList.length > 0 ? `（${validI1WordsList.length} 个 i+1 词汇保留）` : "") +
            (finalRemoved.length > 0 ? `，过滤 ${finalRemoved.length} 个已掌握词汇` : "")
        );

        // ── Step 5: 本地按顺序替换 ─────────────────────────────
        const rewrittenText = applySimplifiedWords(originalText, finalAboveI1Words, simplifiedWords);

        // 构建 rewriteMappings
        const newMappings = [];
        finalAboveI1Words.forEach((word, i) => {
          const replacement = simplifiedWords[i];
          if (replacement && replacement !== "") {
            newMappings.push({
              original: preserveCase(word, replacement),
              originalLower: word.toLowerCase(),
              rewritten: word,
              confirmed: true,
              finalLevel: finalWordLevels[word.toLowerCase()] || targetLevel,
            });
          } else {
            newMappings.push({
              original: word,
              originalLower: word.toLowerCase(),
              rewritten: word,
              confirmed: false,
              finalLevel: finalWordLevels[word.toLowerCase()] || targetLevel,
            });
          }
        });

        const uniqueValidI1Words = toUniqueLowerWordList(validI1WordsList);
        const uniqueFinalAboveI1Words = toUniqueLowerWordList(finalAboveI1Words);

        // 更新状态
        setRewrittenText(rewrittenText);
        setRewriteMappings(newMappings);
        setValidI1Words(uniqueValidI1Words);
        setValidAboveI1Words(uniqueFinalAboveI1Words);
        setRemovedWords(finalRemoved);
        setWordLevels(finalWordLevels);
        setFlowStatus("generated");
        setViewModeState("original");
        if (articleId) {
          await persistRecord({
            originalText,
            rewrittenText,
            mappings: newMappings,
            validI1Words: uniqueValidI1Words,
            validAboveI1Words: uniqueFinalAboveI1Words,
            removedWords: finalRemoved,
            wordLevels: finalWordLevels,
            flowStatus: "generated",
            viewMode: "original",
            rewrittenAt: Date.now(),
          });
          onSuccess?.(articleId, rewrittenText);
        }
      } catch (err) {
        const msg = err?.message || "网络错误";
        toast.error("重写失败：" + msg);
        setRewriteError(msg);
      } finally {
        setIsRewriting(false);
      }
    },
    [accessToken, apiCall, articleId, onSuccess, persistRecord]
  );

  return {
    rewrittenText,
    rewriteMappings,
    validI1Words,
    validAboveI1Words,
    removedWords,
    wordLevels,
    viewMode,
    setViewMode: handleSwitchView,
    isRewriting,
    rewriteError,
    diagnosticSnapshot,
    flowStatus,
    saveDiagnosticSnapshot,
    clearRewrite,
    handleRewrite,
  };
}
