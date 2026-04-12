/**
 * ReadingPage.jsx — 阅读板块根组件
 * =================================
 * Phase 35: 材料诊断台 + 继续生成前置确认
 * Phase 36: 显式阶段流水线 + 阅读包资产页
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { readCefrLevel } from "../../app/authStorage";
import { computeCefrClassName } from "./ArticlePanel";
import { getOrCreateAnalyzer } from "../../hooks/useRichLayout";
import { TranslationDialog } from "../wordbook/TranslationDialog";
import { useReadingRewrite } from "../../hooks/useReadingRewrite";
import { HistoryPanel, saveHistoryRecord } from "./HistoryPanel";
import { LeftPanel } from "./LeftPanel";
import { getDefaultActiveLevels } from "./AnalysisPanel";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { ReadingPipelinePanel } from "./ReadingPipelinePanel";
import { ReadingClassroom } from "./classroom/ReadingClassroom";
import {
  buildDiagnosticSnapshot,
  splitDiagnosticText,
  updateDiagnosticTarget,
} from "./readingDiagnostics";
import { estimateRewriteTokens } from "./api/readingRewriteApi";

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
  const [, setArticleLines] = useState([]);
  const [translationDialog, setTranslationDialog] = useState({ open: false, text: "" });
  const [mode, setMode] = useState("input");
  const [activeArticleText, setActiveArticleText] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [historyCourseOverride, setHistoryCourseOverride] = useState(null);
  const [activeLevels, setActiveLevels] = useState(defaultActiveLevels);
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
    isRewriting,
    rewriteError,
    diagnosticSnapshot,
    flowStatus,
    pipelineState,
    readingCourse,
    saveDiagnosticSnapshot,
    clearRewrite,
    handleRewrite,
  } = useReadingRewrite({
    apiCall,
    accessToken,
    articleId: activeHistoryId,
    onSuccess: () => setHistoryRefreshKey((value) => value + 1),
  });

  useEffect(() => {
    if (!activeHistoryId || isRewriting) return;
    if (historyCourseOverride || readingCourse || flowStatus === "generated") {
      setMode("classroom");
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
  }, [activeHistoryId, diagnosticSnapshot, flowStatus, historyCourseOverride, isRewriting, pipelineState, readingCourse]);

  useEffect(() => {
    if (mode !== "pipeline") {
      setShowPipelineOriginal(false);
    }
  }, [mode]);

  const handleWordClick = useCallback((word, segment) => {
    const cefrClass = computeCefrClassName(segment.cefrLevel, userLevel);
    setSelectedWords((prev) => {
      const exists = prev.some((item) => item.word === word);
      if (exists) return prev.filter((item) => item.word !== word);
      return [...prev, { word, cefrLevel: segment.cefrLevel, cefrClass }];
    });
  }, [userLevel]);

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
    setHistoryCourseOverride(null);
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
    setHistoryCourseOverride(null);
    setDiagnosticError(null);
    setActiveArticleText(record.text);
    setActiveHistoryId(record.id);
    setSelectedWords([]);
    setArticleLines([]);

    const immediateCourse = rewriteMeta?.readingCourse || rewriteMeta?.courseData || null;
    setHistoryCourseOverride(immediateCourse);

    if (
      immediateCourse?.mode?.startsWith?.("reading_classroom_") ||
      (Array.isArray(immediateCourse?.scenes) && immediateCourse.scenes.length > 0) ||
      (Array.isArray(immediateCourse?.sections) && immediateCourse.sections.length > 0)
    ) {
      setMode("classroom");
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
    setHistoryCourseOverride(null);
    setSelectedWords([]);
    setArticleLines([]);
    setDiagnosticError(null);
    clearRewrite();
  }, [clearRewrite]);

  const classroomCourse = readingCourse || historyCourseOverride;

  return (
    <Suspense fallback={<PageFallback />}>
      <div className="reading-container">
        {mode !== "classroom" && (
          <HistoryPanel
            onSelect={handleSelectHistory}
            activeId={activeHistoryId}
            refreshKey={historyRefreshKey}
          />
        )}

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

        {mode === "classroom" ? (
          <div style={{ height: "calc(100dvh - 5rem)", borderRadius: "0.75rem", overflow: "hidden", border: "1px solid var(--border)" }}>
            {classroomCourse ? (
              <ReadingClassroom
                articleId={activeHistoryId}
                course={classroomCourse}
                sourceTexts={{
                  originalText: activeArticleText,
                  rewrittenText: rewrittenText || activeArticleText,
                }}
                apiCall={apiCall}
                onExit={() => setMode("diagnostic")}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted/20 text-sm text-muted-foreground">
                正在恢复课程进度...
              </div>
            )}
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
