/**
 * useReadingRewrite.js — 阅读板块 AI 重写状态管理
 * ==============================================
 * Phase 29: AI 重写与路由
 * Phase 32: IndexedDB 持久化（articleId 主键，自动加载，视图偏好记忆）
 * Phase 35: 诊断快照持久化
 * Phase 36: 显式阶段流水线 + 阅读包资产
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readCefrLevel } from "../app/authStorage";
import { syncReadingPackToServer } from "../features/reading/api/readingRewriteApi";
import {
  getRewriteRecord,
  normalizeRewriteRecord,
  saveRewriteRecord as dbSave,
  updatePackViewMode as dbUpdatePackViewMode,
  updateViewMode as dbUpdateViewMode,
} from "../features/reading/readingRewriteDB";
import { normalizeReadingCourse } from "../features/reading/readingCourse";
import { buildDiagnosticSnapshot, updateDiagnosticTarget } from "../features/reading/readingDiagnostics";
import {
  createInitialPipelineState,
  readingPipelineReducer,
} from "../features/reading/readingPipelineMachine";
import {
  estimateRewriteTokens,
  extractLemmas,
  simplifyWords,
} from "../features/reading/api/readingRewriteApi";
import { getOrCreateAnalyzer } from "../utils/vocabAnalyzer";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function levelToNum(level) {
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

function applySimplifiedWords(originalText, words, replacements) {
  if (!words || words.length === 0) return originalText;
  let result = originalText;
  words.forEach((rawWord, i) => {
    const replacement = replacements[i];
    if (replacement === "" || replacement == null) {
      return;
    }
    const escaped = rawWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, replacement);
  });
  return result;
}

function preserveCase(originalWord, replacement) {
  if (!originalWord || !replacement) return replacement;
  if (originalWord === originalWord.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (
    originalWord.charAt(0) === originalWord.charAt(0).toUpperCase() &&
    originalWord.slice(1) === originalWord.slice(1).toLowerCase()
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

function buildFallbackDiagnosticSnapshot(text, userLevel, selectedTargetLevel) {
  return buildDiagnosticSnapshot({
    text,
    userLevel,
    report: {
      totalWords: String(text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
      overallGrade: userLevel,
      levelCounts: {},
      userAdaptability: { score: null, message: "" },
    },
    selectedTargetLevel,
    estimatedTokens: null,
    estimatedChargeYuan: null,
  });
}

export function useReadingRewrite({ apiCall, accessToken, articleId, onSuccess }) {
  const [rewrittenText, setRewrittenText] = useState(null);
  const [rewriteMappings, setRewriteMappings] = useState([]);
  const [validI1Words, setValidI1Words] = useState([]);
  const [validAboveI1Words, setValidAboveI1Words] = useState([]);
  const [removedWords, setRemovedWords] = useState([]);
  const [wordLevels, setWordLevels] = useState({});
  const [viewMode, setViewModeState] = useState("original");
  const [packViewMode, setPackViewModeState] = useState("original");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);
  const [diagnosticSnapshot, setDiagnosticSnapshot] = useState(null);
  const [flowStatus, setFlowStatus] = useState("idle");
  const [readingPack, setReadingPack] = useState(null);
  const [readingCourse, setReadingCourse] = useState(null);
  const [pipelineState, setPipelineState] = useState(createInitialPipelineState());

  const savedArticleIdRef = useRef(null);
  const pipelineStateRef = useRef(createInitialPipelineState());

  const syncPipelineState = useCallback((nextState) => {
    pipelineStateRef.current = nextState;
    setPipelineState(nextState);
  }, []);

  const resetLocalState = useCallback(() => {
    setRewrittenText(null);
    setRewriteMappings([]);
    setValidI1Words([]);
    setValidAboveI1Words([]);
    setRemovedWords([]);
    setWordLevels({});
    setDiagnosticSnapshot(null);
    setRewriteError(null);
    setFlowStatus("idle");
    setViewModeState("original");
    setPackViewModeState("original");
    setReadingPack(null);
    setReadingCourse(null);
    syncPipelineState(createInitialPipelineState());
  }, [syncPipelineState]);

  const persistRecord = useCallback(
    async (patch) => {
      const resolvedArticleId = patch.articleId ?? articleId;
      if (!resolvedArticleId) return null;
      const existing = normalizeRewriteRecord((await getRewriteRecord(resolvedArticleId)) || {});
      const nextRecord = normalizeRewriteRecord({
        articleId: resolvedArticleId,
        originalText: patch.originalText ?? existing.originalText ?? "",
        rewrittenText: patch.rewrittenText ?? existing.rewrittenText ?? null,
        mappings: patch.mappings ?? existing.mappings ?? [],
        validI1Words: patch.validI1Words ?? existing.validI1Words ?? [],
        validAboveI1Words: patch.validAboveI1Words ?? existing.validAboveI1Words ?? [],
        removedWords: patch.removedWords ?? existing.removedWords ?? [],
        wordLevels: patch.wordLevels ?? existing.wordLevels ?? {},
        diagnosticSnapshot: patch.diagnosticSnapshot ?? existing.diagnosticSnapshot ?? null,
        pipeline: patch.pipeline ?? existing.pipeline ?? createInitialPipelineState(),
        readingPack: patch.readingPack ?? existing.readingPack ?? null,
        readingCourse: patch.readingCourse ?? existing.readingCourse ?? null,
        flowStatus: patch.flowStatus ?? existing.flowStatus ?? "idle",
        viewMode: patch.viewMode ?? existing.viewMode ?? "original",
        packViewMode: patch.packViewMode ?? existing.packViewMode ?? patch.viewMode ?? existing.viewMode ?? "original",
        rewrittenAt: patch.rewrittenAt ?? existing.rewrittenAt ?? Date.now(),
      });
      await dbSave(nextRecord);
      savedArticleIdRef.current = resolvedArticleId;
      // Fire-and-forget sync to backend
      syncReadingPackToServer(nextRecord, apiCall);
      return nextRecord;
    },
    [articleId, apiCall]
  );

  const persistPipelineAction = useCallback(
    async (action, patch = {}) => {
      const nextPipeline = readingPipelineReducer(pipelineStateRef.current, action);
      syncPipelineState(nextPipeline);
      const nextFlowStatus =
        action.type === "course_completed" || action.type === "pack_completed"
          ? "generated"
          : action.type === "stage_failed"
            ? "failed"
            : "pipeline";
      await persistRecord({
        ...patch,
        pipeline: nextPipeline,
        flowStatus: nextFlowStatus,
      });
      return nextPipeline;
    },
    [persistRecord, syncPipelineState]
  );

  useEffect(() => {
    if (!articleId) return;

    let cancelled = false;
    (async () => {
      try {
        const record = await getRewriteRecord(articleId);
        if (savedArticleIdRef.current !== articleId) {
          resetLocalState();
        }
        if (cancelled || !record) return;

        const normalized = normalizeRewriteRecord(record);
        savedArticleIdRef.current = articleId;
        setRewrittenText(normalized.rewrittenText);
        setRewriteMappings(normalized.mappings || []);
        setValidI1Words(normalized.validI1Words || []);
        setValidAboveI1Words(normalized.validAboveI1Words || []);
        setRemovedWords(normalized.removedWords || []);
        setWordLevels(normalized.wordLevels || {});
        setDiagnosticSnapshot(normalized.diagnosticSnapshot || null);
        setFlowStatus(normalized.flowStatus || "idle");
        setViewModeState(normalized.viewMode || "original");
        setPackViewModeState(normalized.packViewMode || normalized.viewMode || "original");
        setReadingPack(normalized.readingPack || null);
        setReadingCourse(normalized.readingCourse || null);
        setRewriteError(normalized.pipeline?.error?.message || null);
        syncPipelineState(normalized.pipeline || createInitialPipelineState());
      } catch (error) {
        console.error("Failed to auto-load rewrite:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId, resetLocalState, syncPipelineState]);

  const setViewMode = useCallback(
    (mode) => {
      if (mode === "rewritten" && !rewrittenText) return;
      setViewModeState(mode);
      setPackViewModeState(mode);
      if (articleId) {
        dbUpdateViewMode(articleId, mode).catch(console.error);
      }
    },
    [articleId, rewrittenText]
  );

  const setPackViewMode = useCallback(
    (mode) => {
      setPackViewModeState(mode);
      if (mode === "original" || mode === "rewritten") {
        setViewModeState(mode);
      }
      if (articleId) {
        dbUpdatePackViewMode(articleId, mode).catch(console.error);
      }
    },
    [articleId]
  );

  const clearRewrite = useCallback(() => {
    resetLocalState();
  }, [resetLocalState]);

  const saveDiagnosticSnapshot = useCallback(
    async ({ articleId: articleIdOverride = null, originalText, snapshot }) => {
      const initialPipeline = createInitialPipelineState();
      setDiagnosticSnapshot(snapshot);
      setFlowStatus("diagnosed");
      setRewriteError(null);
      setViewModeState("original");
      setPackViewModeState("original");
      setReadingPack(null);
      setReadingCourse(null);
      syncPipelineState(initialPipeline);
      await persistRecord({
        articleId: articleIdOverride,
        originalText,
        diagnosticSnapshot: snapshot,
        pipeline: initialPipeline,
        flowStatus: "diagnosed",
        rewrittenText: null,
        mappings: [],
        validI1Words: [],
        validAboveI1Words: [],
        removedWords: [],
        wordLevels: {},
        readingPack: null,
        readingCourse: null,
        viewMode: "original",
        packViewMode: "original",
      });
      onSuccess?.(articleIdOverride || articleId, snapshot);
    },
    [articleId, onSuccess, persistRecord, syncPipelineState]
  );

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

      const safeOriginalText = String(originalText || "").trim();
      let activeStage = "parsing";
      setIsRewriting(true);
      setRewriteError(null);
      setFlowStatus("pipeline");
      setReadingPack(null);
      setReadingCourse(null);

      const startStage = async (stage, headline, detail, progressPercent = 0, patch = {}) => {
        activeStage = stage;
        return persistPipelineAction(
          {
            type: "stage_started",
            stage,
            headline,
            detail,
            progressPercent,
          },
          {
            originalText: safeOriginalText,
            diagnosticSnapshot: patch.diagnosticSnapshot ?? diagnosticSnapshot,
            readingPack: null,
            readingCourse: patch.readingCourse ?? null,
            viewMode: "original",
            packViewMode: patch.packViewMode ?? packViewMode,
            ...patch,
          },
        );
      };

      const completeStage = async (stage, detail, patch = {}) => {
        return persistPipelineAction(
          {
            type: "stage_completed",
            stage,
            detail,
          },
          {
            originalText: safeOriginalText,
            diagnosticSnapshot: patch.diagnosticSnapshot ?? diagnosticSnapshot,
            readingPack: patch.readingPack ?? null,
            readingCourse: patch.readingCourse ?? null,
            viewMode: patch.viewMode ?? "original",
            packViewMode: patch.packViewMode ?? packViewMode,
            ...patch,
          },
        );
      };

      const failStage = async (stage, message) => {
        setRewriteError(message);
        setFlowStatus("failed");
        await persistPipelineAction(
          {
            type: "stage_failed",
            stage,
            message,
          },
          {
            originalText: safeOriginalText,
            diagnosticSnapshot,
            readingPack: null,
            readingCourse: null,
            viewMode: "original",
            packViewMode,
          },
        );
      };

      try {
        const userLevel = readCefrLevel() || "B1";
        const targetLevel = targetLevelOverride || diagnosticSnapshot?.selectedTargetLevel || getTargetLevel(userLevel);

        await startStage("parsing", "读取材料", "正在准备文本与当前选择", 5);
        await completeStage("parsing", `已读取 ${safeOriginalText.length} 个字符`);

        await startStage("difficulty_judgment", "确认难度判断", "正在应用诊断结果与目标等级", 20);
        const nextDiagnosticSnapshot = diagnosticSnapshot
          ? updateDiagnosticTarget(diagnosticSnapshot, targetLevel)
          : buildFallbackDiagnosticSnapshot(safeOriginalText, userLevel, targetLevel);
        setDiagnosticSnapshot(nextDiagnosticSnapshot);
        await completeStage("difficulty_judgment", `目标等级 ${nextDiagnosticSnapshot.selectedTargetLevel}`, {
          diagnosticSnapshot: nextDiagnosticSnapshot,
        });

        await startStage("simplification_planning", "规划简化策略", "正在筛选需要保留与需要改写的词", 35, {
          diagnosticSnapshot: nextDiagnosticSnapshot,
        });

        if (showEstimateToast) {
          try {
            const est = await estimateRewriteTokens(safeOriginalText, accessToken);
            toast.info(
              `预计消耗 ${est.estimatedChargeYuan.toFixed(2)} 元（约 ${est.estimatedTokens} tokens）`,
              { duration: 4000 }
            );
          } catch (error) {
            console.warn("Token estimation failed:", error);
          }
        }

        const inputWords = Array.isArray(words) ? words : [];
        const originalWords = inputWords.map((word) => word.word);
        const lemmas = inputWords.length > 0
          ? (await extractLemmas(safeOriginalText, originalWords, accessToken)).lemmas
          : [];

        const analyzer = await getOrCreateAnalyzer();
        const validI1WordsList = [];
        const validAboveI1WordsList = [];
        const removedByLemmaWordsList = [];
        const finalWordLevels = {};
        const userLevelNum = levelToNum(userLevel);
        const targetLevelNum = levelToNum(targetLevel);

        for (let index = 0; index < inputWords.length; index += 1) {
          const originalWord = inputWords[index].word;
          const lemma = lemmas[index] || originalWord.toLowerCase();
          const surfaceLevel = String(inputWords[index].level || "");
          const finalLevel = analyzer.lookupCefrLevelForDictionaryForm(lemma) || surfaceLevel || null;
          const originalLower = originalWord.toLowerCase();
          finalWordLevels[originalLower] = finalLevel || "";

          const finalLevelNum = levelToNum(finalLevel);
          if (finalLevelNum < userLevelNum) {
            removedByLemmaWordsList.push({
              word: originalWord,
              lemma,
              finalLevel: finalLevel || "unknown",
              reason: `原型 "${lemma}" 最终等级为 ${finalLevel || "unknown"}，低于用户等级 ${userLevel}`,
            });
          } else if (finalLevelNum === userLevelNum || finalLevelNum === targetLevelNum) {
            validI1WordsList.push(originalWord);
          } else {
            validAboveI1WordsList.push(originalWord);
          }
        }

        const uniqueValidI1Words = toUniqueLowerWordList(validI1WordsList);
        const uniqueFinalAboveI1Words = toUniqueLowerWordList(validAboveI1WordsList);
        const finalRemoved = [...removedByLemmaWordsList];

        await completeStage(
          "simplification_planning",
          validAboveI1WordsList.length > 0
            ? `待简化 ${validAboveI1WordsList.length} 个词`
            : "无需额外简化，保留当前文本",
          {
            diagnosticSnapshot: nextDiagnosticSnapshot,
            validI1Words: uniqueValidI1Words,
            validAboveI1Words: uniqueFinalAboveI1Words,
            removedWords: finalRemoved,
            wordLevels: finalWordLevels,
          }
        );

        await startStage("text_rewriting", "执行文本改写", "正在生成 i+1 版本文本", 65, {
          diagnosticSnapshot: nextDiagnosticSnapshot,
          validI1Words: uniqueValidI1Words,
          validAboveI1Words: uniqueFinalAboveI1Words,
          removedWords: finalRemoved,
          wordLevels: finalWordLevels,
        });

        let simplifiedWords = [];
        if (validAboveI1WordsList.length > 0) {
          const aboveWordLevels = {};
          validAboveI1WordsList.forEach((word) => {
            aboveWordLevels[word.toLowerCase()] = finalWordLevels[word.toLowerCase()] || targetLevel;
          });
          const simplifyResult = await simplifyWords(
            safeOriginalText,
            validAboveI1WordsList,
            targetLevel,
            accessToken,
            false,
            aboveWordLevels,
          );
          simplifiedWords = simplifyResult.simplifiedWords || [];
        }

        const nextRewrittenText = applySimplifiedWords(safeOriginalText, validAboveI1WordsList, simplifiedWords);
        const nextMappings = [];
        validAboveI1WordsList.forEach((word, index) => {
          const replacement = simplifiedWords[index];
          if (replacement && replacement !== "") {
            nextMappings.push({
              original: preserveCase(word, replacement),
              originalLower: word.toLowerCase(),
              rewritten: word,
              confirmed: true,
              finalLevel: finalWordLevels[word.toLowerCase()] || targetLevel,
            });
          } else {
            nextMappings.push({
              original: word,
              originalLower: word.toLowerCase(),
              rewritten: word,
              confirmed: false,
              finalLevel: finalWordLevels[word.toLowerCase()] || targetLevel,
            });
          }
        });

        setRewrittenText(nextRewrittenText);
        setRewriteMappings(nextMappings);
        setValidI1Words(uniqueValidI1Words);
        setValidAboveI1Words(uniqueFinalAboveI1Words);
        setRemovedWords(finalRemoved);
        setWordLevels(finalWordLevels);
        setViewModeState("original");
        setPackViewModeState("original");

        await completeStage("text_rewriting", nextMappings.length > 0 ? `已生成 ${nextMappings.length} 处改写` : "无需改写，保留原文", {
          diagnosticSnapshot: nextDiagnosticSnapshot,
          rewrittenText: nextRewrittenText,
          mappings: nextMappings,
          validI1Words: uniqueValidI1Words,
          validAboveI1Words: uniqueFinalAboveI1Words,
          removedWords: finalRemoved,
          wordLevels: finalWordLevels,
          viewMode: "original",
          packViewMode: "original",
        });

        await startStage("reading_course_generation", "生成阅读课堂", "正在把文章改造成沉浸式课堂", 90, {
          diagnosticSnapshot: nextDiagnosticSnapshot,
          rewrittenText: nextRewrittenText,
          mappings: nextMappings,
          validI1Words: uniqueValidI1Words,
          validAboveI1Words: uniqueFinalAboveI1Words,
          removedWords: finalRemoved,
          wordLevels: finalWordLevels,
        });

        const classroomResp = await apiCall("/api/llm/reading-course/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            article_id: articleId || savedArticleIdRef.current,
            article_title: safeOriginalText.split(/\n+/)[0]?.slice(0, 120) || "Reading Classroom",
            original_text: safeOriginalText,
            rewritten_text: nextRewrittenText,
            target_level: nextDiagnosticSnapshot.selectedTargetLevel,
            valid_i1_words: uniqueValidI1Words,
            valid_above_i1_words: uniqueFinalAboveI1Words,
            word_levels: finalWordLevels,
          }),
        });
        if (!classroomResp.ok) {
          const errorPayload = await classroomResp.json().catch(() => ({}));
          throw new Error(errorPayload.detail || "阅读课堂生成失败");
        }

        const classroomData = await classroomResp.json();
        const nextReadingCourse = normalizeReadingCourse(classroomData.course);
        if (!nextReadingCourse) {
          throw new Error("阅读课堂返回了无效结构");
        }
        setReadingCourse(nextReadingCourse);

        const finalPipelineState = await persistPipelineAction(
          {
            type: "course_completed",
            stage: "reading_course_generation",
            detail: "阅读课堂已生成完成",
          },
          {
            originalText: safeOriginalText,
            diagnosticSnapshot: nextDiagnosticSnapshot,
            rewrittenText: nextRewrittenText,
            mappings: nextMappings,
            validI1Words: uniqueValidI1Words,
            validAboveI1Words: uniqueFinalAboveI1Words,
            removedWords: finalRemoved,
            wordLevels: finalWordLevels,
            readingCourse: nextReadingCourse,
            flowStatus: "generated",
            viewMode: "original",
            packViewMode: "original",
            rewrittenAt: Date.now(),
          }
        );

        syncPipelineState(finalPipelineState);
        setFlowStatus("generated");

        toast.success(
          "阅读课堂已生成" +
            (uniqueValidI1Words.length > 0 ? `（${uniqueValidI1Words.length} 个 i+1 词汇保留）` : "") +
            (finalRemoved.length > 0 ? `，过滤 ${finalRemoved.length} 个已掌握词汇` : "")
        );
        onSuccess?.(articleId, nextRewrittenText);
      } catch (error) {
        const message = error?.message || "网络错误";
        await failStage(activeStage, message);
        const { toast } = await import("sonner");
        toast.error("重写失败：" + message);
      } finally {
        setIsRewriting(false);
      }
    },
    [
      accessToken,
      apiCall,
      articleId,
      diagnosticSnapshot,
      onSuccess,
      packViewMode,
      persistPipelineAction,
      syncPipelineState,
    ]
  );

  return {
    rewrittenText,
    rewriteMappings,
    validI1Words,
    validAboveI1Words,
    removedWords,
    wordLevels,
    viewMode,
    setViewMode,
    packViewMode,
    setPackViewMode,
    isRewriting,
    rewriteError,
    diagnosticSnapshot,
    flowStatus,
    pipelineState,
    readingPack,
    readingCourse,
    saveDiagnosticSnapshot,
    clearRewrite,
    handleRewrite,
  };
}
