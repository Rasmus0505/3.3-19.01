/**
 * ReadingPage.jsx — 阅读板块根组件
 * =================================
 * Phase 35: 材料诊断台 + 继续生成前置确认
 * Phase 36: 显式阶段流水线 + 阅读包资产页
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { readCefrLevel } from "../../app/authStorage";
import { parseResponse } from "../../shared/api/client";
import { cn } from "../../lib/utils";
import { computeCefrClassName } from "./ArticlePanel";
import { getOrCreateAnalyzer } from "../../hooks/useRichLayout";
import { TranslationDialog } from "../wordbook/TranslationDialog";
import { useReadingRewrite } from "../../hooks/useReadingRewrite";
import { useVocabularyFilter } from "./useVocabularyFilter";
import { HistoryPanel, saveHistoryRecord } from "./HistoryPanel";
import { LeftPanel } from "./LeftPanel";
import { AnalysisPanel, getDefaultActiveLevels } from "./AnalysisPanel";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { ReadingPipelinePanel } from "./ReadingPipelinePanel";
import { ReadingPackPanel } from "./ReadingPackPanel";
import {
  buildDiagnosticSnapshot,
  splitDiagnosticText,
  updateDiagnosticTarget,
} from "./readingDiagnostics";
import { estimateRewriteTokens } from "./api/readingRewriteApi";

function CollapseDivider({ collapsed, onToggle, collapseLabel, expandLabel }) {
  return (
    <div className="reading-collapse-divider" aria-hidden={false}>
      <button
        type="button"
        className={cn(
          "reading-collapse-divider__btn",
          collapsed && "reading-collapse-divider__btn--collapsed"
        )}
        onClick={onToggle}
        aria-label={collapsed ? expandLabel : collapseLabel}
        title={collapsed ? expandLabel : collapseLabel}
      >
        {collapsed ? (
          <ChevronDown className="size-4 rotate-[-90deg]" />
        ) : (
          <>
            <ChevronUp className="size-4" />
            <span className="reading-collapse-divider__label">{collapseLabel}</span>
          </>
        )}
      </button>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-3">
        {[80, 95, 70, 90, 60, 85, 75].map((w, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="w-72 shrink-0 space-y-2 rounded-xl border bg-muted/30 p-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

function computeWordStats(lines, wordLevels = {}) {
  const cefrCounts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, SUPER: 0 };
  let total = 0;
  for (const line of lines) {
    for (const seg of line.segments) {
      if (!seg.word) continue;
      total += 1;
      const effectiveLevel = wordLevels[seg.word.toLowerCase()] || seg.cefrLevel;
      if (effectiveLevel && cefrCounts[effectiveLevel] !== undefined) {
        cefrCounts[effectiveLevel] += 1;
      }
    }
  }
  return { total, cefrCounts };
}

async function collectSimplifyCandidatesFromRaw(text, targetLevel) {
  const analyzer = await getOrCreateAnalyzer();
  const result = analyzer.extractSurfaceWordsAtOrAboveLevel(text, targetLevel);
  const seen = new Set();
  const candidates = [];
  for (const token of result) {
    if (!token.word || typeof token.word !== "string") continue;
    const lower = token.word.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      candidates.push({ word: token.word, level: token.level || "SUPER" });
    }
  }
  return candidates;
}

export function ReadingPage({ accessToken, apiCall }) {
  const userLevel = useMemo(() => readCefrLevel() || "B1", []);
  const defaultActiveLevels = useMemo(() => getDefaultActiveLevels(userLevel), [userLevel]);

  const [contentWidth, setContentWidth] = useState(640);
  const [selectedWords, setSelectedWords] = useState([]);
  const [articleLines, setArticleLines] = useState([]);
  const [isAddingToWordbook, setIsAddingToWordbook] = useState(false);
  const [translationDialog, setTranslationDialog] = useState({ open: false, text: "" });
  const [mode, setMode] = useState("input");
  const [activeArticleText, setActiveArticleText] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [activeLevels, setActiveLevels] = useState(defaultActiveLevels);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState(null);
  const [showPipelineOriginal, setShowPipelineOriginal] = useState(false);

  const {
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
    saveDiagnosticSnapshot,
    clearRewrite,
    handleRewrite,
  } = useReadingRewrite({
    apiCall,
    accessToken,
    articleId: activeHistoryId,
    onSuccess: () => setHistoryRefreshKey((value) => value + 1),
  });

  const vocabularyFilter = useVocabularyFilter({
    accessToken,
    userLevel,
    targetLevel: "B2",
  });

  const wordStats = useMemo(() => computeWordStats(articleLines, wordLevels), [articleLines, wordLevels]);

  useEffect(() => {
    if (!activeHistoryId || isRewriting) return;
    if (readingPack || flowStatus === "generated") {
      setMode("pack");
      return;
    }
    if (flowStatus === "pipeline" || flowStatus === "failed" || pipelineState?.currentStage || pipelineState?.lastCompletedStage) {
      setMode("pipeline");
      return;
    }
    if (flowStatus === "diagnosed" || diagnosticSnapshot) {
      setMode("diagnostic");
      return;
    }
    setMode("input");
  }, [activeHistoryId, diagnosticSnapshot, flowStatus, isRewriting, pipelineState, readingPack]);

  useEffect(() => {
    if (mode !== "pipeline") {
      setShowPipelineOriginal(false);
    }
  }, [mode]);

  const handleLevelToggle = useCallback((level) => {
    setActiveLevels((prev) => {
      if (prev.includes(level)) {
        return prev.filter((item) => item !== level);
      }
      return [...prev, level];
    });
  }, []);

  const handleWordClick = useCallback((word, segment) => {
    const cefrClass = computeCefrClassName(segment.cefrLevel, userLevel);
    setSelectedWords((prev) => {
      const exists = prev.some((item) => item.word === word);
      if (exists) return prev.filter((item) => item.word !== word);
      return [...prev, { word, cefrLevel: segment.cefrLevel, cefrClass }];
    });
  }, [userLevel]);

  const handleRemoveWord = useCallback((item) => {
    setSelectedWords((prev) => prev.filter((word) => word.word !== item.word));
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedWords([]);
  }, []);

  const handleTranslate = useCallback((item) => {
    setTranslationDialog({ open: true, text: item.word });
  }, []);

  const handleAddAllToWordbook = useCallback(async () => {
    if (selectedWords.length === 0) return;
    if (!accessToken) {
      toast.error("请先登录");
      return;
    }
    if (!apiCall) {
      toast.error(
        import.meta.env.DEV
          ? "无法发起请求：apiCall 未传入（检查 LearningShellPanelContent 是否传给 ReadingPage）"
          : "无法发起请求：客户端未接入接口"
      );
      return;
    }
    setIsAddingToWordbook(true);
    let successCount = 0;
    let failCount = 0;
    for (const item of selectedWords) {
      try {
        const resp = await apiCall("/api/wordbook/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lesson_id: null,
            sentence_index: null,
            entry_text: item.word,
            entry_type: "word",
            start_token_index: null,
            end_token_index: null,
          }),
        });
        await parseResponse(resp);
        if (resp.ok) successCount += 1;
        else failCount += 1;
      } catch (_) {
        failCount += 1;
      }
    }
    setIsAddingToWordbook(false);
    if (successCount > 0) {
      toast.success(`已加入 ${successCount} 个词到生词本`);
      setSelectedWords([]);
    } else if (failCount > 0) {
      toast.error(`加入失败 ${failCount} 个`);
    }
  }, [accessToken, apiCall, selectedWords]);

  const runDiagnosis = useCallback(async (
    text,
    { articleId: articleIdOverride = null, selectedTargetLevel = null } = {}
  ) => {
    const normalized = String(text || "").trim();
    if (!normalized) return;

    setIsDiagnosing(true);
    setDiagnosticError(null);
    try {
      const analyzer = await getOrCreateAnalyzer();
      const segments = splitDiagnosticText(normalized);
      const report = analyzer.analyzeVideo(segments.length > 0 ? segments : [normalized], userLevel);
      let estimate = { estimatedTokens: null, estimatedChargeYuan: null };
      if (accessToken) {
        try {
          estimate = await estimateRewriteTokens(normalized, accessToken);
        } catch (error) {
          console.warn("Diagnostic estimate failed:", error);
        }
      }
      const snapshot = buildDiagnosticSnapshot({
        text: normalized,
        userLevel,
        report,
        selectedTargetLevel: selectedTargetLevel || diagnosticSnapshot?.selectedTargetLevel || null,
        estimatedTokens: estimate.estimatedTokens,
        estimatedChargeYuan: estimate.estimatedChargeYuan,
      });
      await saveDiagnosticSnapshot({
        articleId: articleIdOverride || activeHistoryId,
        originalText: normalized,
        snapshot,
      });
      setMode("diagnostic");
    } catch (error) {
      const message = error?.message || "诊断失败，请稍后重试。";
      setDiagnosticError(message);
      toast.error(message);
    } finally {
      setIsDiagnosing(false);
    }
  }, [
    accessToken,
    activeHistoryId,
    diagnosticSnapshot?.selectedTargetLevel,
    saveDiagnosticSnapshot,
    userLevel,
  ]);

  const handleArticleSubmit = useCallback(async (text, sourceMetadata = { type: "text" }) => {
    const id = crypto.randomUUID();
    setActiveArticleText(text);
    setActiveHistoryId(id);
    setSelectedWords([]);
    setArticleLines([]);
    clearRewrite();
    setMode("diagnostic");
    try {
      await saveHistoryRecord({
        id,
        text,
        read_at: Date.now(),
        sourceMetadata,
      });
    } catch (error) {
      console.error("Failed to save history:", error);
    }
    await runDiagnosis(text, { articleId: id });
  }, [clearRewrite, runDiagnosis]);

  const handleRetryDiagnosis = useCallback(async () => {
    if (!activeArticleText) return;
    await runDiagnosis(activeArticleText, {
      articleId: activeHistoryId,
      selectedTargetLevel: diagnosticSnapshot?.selectedTargetLevel || null,
    });
  }, [activeArticleText, activeHistoryId, diagnosticSnapshot?.selectedTargetLevel, runDiagnosis]);

  const handleSelectHistory = useCallback(async (record, rewriteMeta) => {
    clearRewrite();
    setDiagnosticError(null);
    setActiveArticleText(record.text);
    setActiveHistoryId(record.id);
    setSelectedWords([]);
    setArticleLines([]);

    if (rewriteMeta?.readingPack?.status === "completed" || (rewriteMeta?.rewrittenText && rewriteMeta?.flowStatus === "generated")) {
      setMode("pack");
      return;
    }

    if (
      rewriteMeta?.flowStatus === "pipeline" ||
      rewriteMeta?.flowStatus === "failed" ||
      rewriteMeta?.pipeline?.currentStage ||
      rewriteMeta?.pipeline?.lastCompletedStage
    ) {
      setMode("pipeline");
      return;
    }

    setMode("diagnostic");
    if (!rewriteMeta?.diagnosticSnapshot) {
      await runDiagnosis(record.text, { articleId: record.id });
    }
  }, [clearRewrite, runDiagnosis]);

  const handleDiagnosticTargetChange = useCallback(async (level) => {
    if (!diagnosticSnapshot) return;
    const nextSnapshot = updateDiagnosticTarget(diagnosticSnapshot, level);
    await saveDiagnosticSnapshot({
      articleId: activeHistoryId,
      originalText: activeArticleText,
      snapshot: nextSnapshot,
    });
  }, [activeArticleText, activeHistoryId, diagnosticSnapshot, saveDiagnosticSnapshot]);

  const handleContinueGeneration = useCallback(async () => {
    if (!diagnosticSnapshot || !activeArticleText) return;
    if (!accessToken) {
      toast.info("请先登录后继续生成");
      return;
    }

    setMode("pipeline");
    setShowPipelineOriginal(false);
    try {
      const candidates = await collectSimplifyCandidatesFromRaw(
        activeArticleText,
        diagnosticSnapshot.selectedTargetLevel
      );
      await handleRewrite(activeArticleText, {
        words: candidates,
        targetLevel: diagnosticSnapshot.selectedTargetLevel,
        showEstimateToast: false,
      });
    } catch (error) {
      const message = error?.message || "生成前准备失败，请稍后重试。";
      toast.error(message);
      setMode("diagnostic");
    }
  }, [accessToken, activeArticleText, diagnosticSnapshot, handleRewrite]);

  const handleEditAgain = useCallback(() => {
    setMode("input");
    setActiveArticleText("");
    setActiveHistoryId(null);
    setSelectedWords([]);
    setArticleLines([]);
    setDiagnosticError(null);
    clearRewrite();
  }, [clearRewrite]);

  const showAnalysisPanel = mode === "pack";

  return (
    <Suspense fallback={<PageFallback />}>
      <div className="reading-container">
        <HistoryPanel
          onSelect={handleSelectHistory}
          activeId={activeHistoryId}
          refreshKey={historyRefreshKey}
        />

        {mode === "diagnostic" ? (
          <div className="reading-diagnostic-layout">
            <div className="reading-diagnostic-layout__preview">
              <LeftPanel
                mode="reading"
                articleText={activeArticleText}
                onSubmit={handleArticleSubmit}
                onEditAgain={handleEditAgain}
                showEditAgain={false}
                contentWidth={contentWidth}
                onWidthChange={setContentWidth}
                onLinesReady={setArticleLines}
                selectedWords={[]}
                onWordClick={() => {}}
                activeLevels={[]}
                rewriteMappings={[]}
                validI1Words={[]}
                validAboveI1Words={[]}
                removedWords={[]}
                wordLevels={{}}
                viewMode="original"
                isRewriting={false}
                rewriteError={null}
              />
            </div>
            <div className="reading-diagnostic-layout__dashboard">
              <DiagnosticPanel
                userLevel={userLevel}
                snapshot={diagnosticSnapshot}
                isDiagnosing={isDiagnosing}
                diagnosticError={diagnosticError}
                isGenerating={isRewriting}
                onTargetLevelChange={handleDiagnosticTargetChange}
                onRetryDiagnosis={handleRetryDiagnosis}
                onContinueGeneration={handleContinueGeneration}
                onEditAgain={handleEditAgain}
              />
            </div>
          </div>
        ) : null}

        {mode === "pipeline" ? (
          <div className="reading-pipeline-layout">
            <ReadingPipelinePanel
              pipelineState={pipelineState}
              isGenerating={isRewriting}
              onContinue={handleContinueGeneration}
              onViewOriginal={() => setShowPipelineOriginal((value) => !value)}
            />

            {showPipelineOriginal ? (
              <div className="reading-pipeline-layout__original">
                <LeftPanel
                  mode="reading"
                  articleText={activeArticleText}
                  onSubmit={handleArticleSubmit}
                  onEditAgain={handleEditAgain}
                  showEditAgain={false}
                  contentWidth={contentWidth}
                  onWidthChange={setContentWidth}
                  onLinesReady={setArticleLines}
                  selectedWords={[]}
                  onWordClick={() => {}}
                  activeLevels={[]}
                  rewriteMappings={[]}
                  validI1Words={[]}
                  validAboveI1Words={[]}
                  removedWords={[]}
                  wordLevels={{}}
                  viewMode="original"
                  isRewriting={false}
                  rewriteError={null}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "pack" ? (
          <div className="reading-pack-layout">
            <div className="reading-pack-layout__main">
              <ReadingPackPanel
                pack={readingPack || {
                  originalText: activeArticleText,
                  rewrittenText: rewrittenText || activeArticleText,
                  mappings: rewriteMappings,
                  validI1Words,
                  validAboveI1Words,
                  removedWords,
                  wordLevels,
                  diagnosticSummary: {
                    materialDifficulty: diagnosticSnapshot?.materialDifficulty || "--",
                    preservedI1Count: diagnosticSnapshot?.preservedI1Count ?? 0,
                    aboveI1Count: diagnosticSnapshot?.aboveI1Count ?? 0,
                  },
                  targetLevel: diagnosticSnapshot?.selectedTargetLevel || "--",
                  comparisonCards: [],
                }}
                articleId={activeHistoryId}
                packViewMode={packViewMode}
                onPackViewModeChange={setPackViewMode}
                contentWidth={contentWidth}
                onWidthChange={setContentWidth}
                onLinesReady={setArticleLines}
                selectedWords={selectedWords}
                onWordClick={handleWordClick}
                activeLevels={activeLevels}
                apiCall={apiCall}
                accessToken={accessToken}
              />
            </div>

            <CollapseDivider
              collapsed={!analysisPanelOpen}
              onToggle={() => setAnalysisPanelOpen((value) => !value)}
              collapseLabel="收起词汇表"
              expandLabel="展开词汇表"
            />
            <div
              className={cn(
                "reading-analysis-column",
                analysisPanelOpen ? "reading-analysis-column--open" : "reading-analysis-column--closed"
              )}
            >
              {showAnalysisPanel && analysisPanelOpen ? (
                <AnalysisPanel
                  selectedWords={selectedWords}
                  wordStats={wordStats}
                  userLevel={userLevel}
                  activeLevels={activeLevels}
                  onLevelToggle={handleLevelToggle}
                  onRemove={handleRemoveWord}
                  onAddAllToWordbook={handleAddAllToWordbook}
                  onClearAll={handleClearAll}
                  onTranslate={handleTranslate}
                  rewriteMappings={rewriteMappings}
                  isAdding={isAddingToWordbook}
                  rewriteError={rewriteError}
                  vocabularyFilter={vocabularyFilter}
                />
              ) : (
                <div className="reading-analysis-rail" />
              )}
            </div>
          </div>
        ) : null}

        {mode === "input" ? (
          <div className="reading-layout">
            <LeftPanel
              mode="input"
              articleText=""
              onSubmit={handleArticleSubmit}
              onEditAgain={handleEditAgain}
              contentWidth={contentWidth}
              onWidthChange={setContentWidth}
              onLinesReady={setArticleLines}
              selectedWords={selectedWords}
              onWordClick={handleWordClick}
              activeLevels={activeLevels}
              rewriteMappings={rewriteMappings}
              validI1Words={validI1Words}
              validAboveI1Words={validAboveI1Words}
              removedWords={removedWords}
              wordLevels={wordLevels}
              viewMode={viewMode}
              isRewriting={isRewriting}
              rewriteError={rewriteError}
              accessToken={accessToken}
            />
          </div>
        ) : null}
      </div>
      <TranslationDialog
        open={translationDialog.open}
        onClose={() => setTranslationDialog((state) => ({ ...state, open: false }))}
        text={translationDialog.text}
        apiCall={apiCall}
      />
    </Suspense>
  );
}
