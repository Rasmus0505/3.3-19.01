/**
 * ReadingPage.jsx — 阅读板块根组件
 * =================================
 * Phase 28: 词选动画、翻译弹窗、批量加入生词本、难度分布统计
 * Phase 29: AI 重写、原文/重写版丝滑切换
 * Phase 30 (本文件): 新 UI 布局 — 顶部历史记录 + 左侧输入/阅读二合一 + 右侧分析面板
 *
 * 布局：
 *   ┌─────────────────────────────────────────┐
 *   │  HistoryPanel (顶部历史记录)              │
 *   ├───────────────────────┬──────────────────┤
 *   │  LeftPanel            │  AnalysisPanel   │
 *   │  (输入模式 / 阅读模式)  │  (难度分布+词汇) │
 *   └───────────────────────┴──────────────────┘
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { readCefrLevel } from "../../app/authStorage";
import { parseResponse } from "../../shared/api/client";
import { cn } from "../../lib/utils";
import { computeCefrClassName } from "./ArticlePanel";
import { TranslationDialog } from "../wordbook/TranslationDialog";
import { useReadingRewrite } from "../../hooks/useReadingRewrite";
import { HistoryPanel, saveHistoryRecord } from "./HistoryPanel";
import { LeftPanel } from "./LeftPanel";
import { AnalysisPanel, getDefaultActiveLevels } from "./AnalysisPanel";

const DEMO_ARTICLE = `The Art of Reading in a Digital Age

In the modern world, reading has evolved beyond the traditional paper-and-ink experience. Digital platforms have transformed how we consume written content, offering new possibilities for language learners and avid readers alike.

One of the most significant advantages of digital reading is accessibility. With a smartphone or tablet, learners can access thousands of texts at any moment. This democratization of knowledge has made it easier for people around the globe to improve their literacy skills and expand their vocabulary.

However, this abundance of content also presents challenges. How can learners effectively navigate through the overwhelming amount of material available online? The answer lies in developing strategic reading habits and leveraging tools that support comprehension.

Contextual vocabulary learning represents one of the most effective approaches to language acquisition. Rather than memorizing isolated words from flash cards, learners benefit from encountering new vocabulary in meaningful passages. This method allows readers to infer the meaning of unfamiliar words from surrounding context clues.

The integration of technology into reading practice offers exciting opportunities. Adaptive platforms can analyze a reader's current proficiency level and select appropriate texts. Such personalization ensures that learners are consistently challenged without becoming frustrated by content that exceeds their current abilities.

Moreover, the ability to interact with text—highlighting, annotating, and looking up words instantly—creates a more engaging learning experience. These interactive features transform passive reading into an active dialogue between the reader and the text.

As we look to the future, the boundaries between reading, learning, and entertainment continue to blur. The most successful learners will be those who approach digital reading not as a chore, but as an adventure in discovery.`;

function PageFallback() {
  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-3">
        {[80, 95, 70, 90, 60, 85, 75].map((w, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" style={{ width: w + "%" }} />
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

/** 计算文章的 CEFR 难度分布统计 */
function computeWordStats(lines) {
  const cefrCounts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, SUPER: 0 };
  let total = 0;
  for (const line of lines) {
    for (const seg of line.segments) {
      if (seg.cefrLevel && cefrCounts[seg.cefrLevel] !== undefined) {
        cefrCounts[seg.cefrLevel]++;
      }
      total++;
    }
  }
  return { total, cefrCounts };
}

/**
 * ReadingPage — 阅读板块入口组件
 *
 * @param {object} props
 * @param {string} props.accessToken — 用户 access token（用于 API 调用）
 * @param {Function} props.apiCall — API 调用函数（来自 LearningShell）
 */
export function ReadingPage({ accessToken, apiCall }) {
  const userLevel = useMemo(() => readCefrLevel() || "B1", []);
  const defaultActiveLevels = useMemo(() => getDefaultActiveLevels(userLevel), [userLevel]);

  const [contentWidth, setContentWidth] = useState(640);
  const [selectedWords, setSelectedWords] = useState([]);
  const [articleLines, setArticleLines] = useState([]);
  const [isAddingToWordbook, setIsAddingToWordbook] = useState(false);
  const [translationDialog, setTranslationDialog] = useState({ open: false, text: "" });

  // 面板模式: 'input' | 'reading'
  const [mode, setMode] = useState("input");
  const [activeArticleText, setActiveArticleText] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  // 用户勾选的级别
  const [activeLevels, setActiveLevels] = useState(defaultActiveLevels);

  const wordStats = useMemo(() => computeWordStats(articleLines), [articleLines]);

  // 级别切换
  const handleLevelToggle = useCallback((level) => {
    setActiveLevels((prev) => {
      if (prev.includes(level)) {
        return prev.filter((l) => l !== level);
      }
      return [...prev, level];
    });
  }, []);

  const handleWordClick = useCallback((word, segment) => {
    const cefrClass = computeCefrClassName(segment.cefrLevel, userLevel);
    setSelectedWords((prev) => {
      const exists = prev.some((w) => w.word === word);
      if (exists) return prev.filter((w) => w.word !== word);
      return [...prev, { word, cefrLevel: segment.cefrLevel, cefrClass }];
    });
  }, [userLevel]);

  const handleRemoveWord = useCallback((item) => {
    setSelectedWords((prev) => prev.filter((w) => w.word !== item.word));
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
        const data = await parseResponse(resp);
        if (resp.ok) successCount++;
        else failCount++;
      } catch (_) {
        failCount++;
      }
    }
    setIsAddingToWordbook(false);
    if (successCount > 0) {
      toast.success("已加入 " + successCount + " 个词到生词本");
      setSelectedWords([]);
    } else if (failCount > 0) {
      toast.error("加入失败 " + failCount + " 个");
    }
  }, [accessToken, apiCall, selectedWords]);

  // ── AI 重写 ─────────────────────────────────────
  const {
    rewrittenText,
    viewMode,
    setViewMode,
    isRewriting,
    rewriteError,
    clearRewrite,
    handleRewrite,
  } = useReadingRewrite({ apiCall, accessToken });

  const prevCommittedRef = useRef(activeArticleText);
  useEffect(() => {
    if (prevCommittedRef.current !== activeArticleText && rewrittenText) {
      clearRewrite();
    }
    prevCommittedRef.current = activeArticleText;
  }, [activeArticleText, rewrittenText, clearRewrite]);

  const activeText =
    viewMode === "rewritten" && rewrittenText ? rewrittenText : activeArticleText;

  const showRewriteButton = !rewrittenText;

  const onRewriteClick = useCallback(() => {
    const t = activeArticleText.trim();
    if (!t) {
      toast.error("请先输入或粘贴阅读正文");
      return;
    }
    handleRewrite(t);
  }, [activeArticleText, handleRewrite]);

  // ── 文章提交（切换到阅读模式）────────────────────
  const handleArticleSubmit = useCallback(
    async (text) => {
      setActiveArticleText(text);
      setMode("reading");
      setSelectedWords([]);
      clearRewrite();
      // 保存到历史记录
      try {
        await saveHistoryRecord({
          id: crypto.randomUUID(),
          text,
          read_at: Date.now(),
        });
      } catch (e) {
        console.error("Failed to save history:", e);
      }
    },
    [clearRewrite]
  );

  // ── 重新输入 ─────────────────────────────────────
  const handleEditAgain = useCallback(() => {
    setMode("input");
    clearRewrite();
  }, [clearRewrite]);

  // ── 点击历史记录 ─────────────────────────────────
  const handleSelectHistory = useCallback(
    async (record) => {
      setActiveArticleText(record.text);
      setActiveHistoryId(record.id);
      setMode("reading");
      setSelectedWords([]);
      clearRewrite();
    },
    [clearRewrite]
  );

  // ── 原文/重写切换 ────────────────────────────────
  const showViewToggle = Boolean(rewrittenText);

  return (
    <Suspense fallback={<PageFallback />}>
      <div className="reading-container">
        {/* 顶部历史记录 */}
        <HistoryPanel
          onSelect={handleSelectHistory}
          activeId={activeHistoryId}
        />

        {showViewToggle ? (
          <div className="reading-view-toggle">
            <button
              className={cn(
                "reading-view-toggle__btn",
                viewMode === "original" && "reading-view-toggle__btn--active"
              )}
              onClick={() => setViewMode("original")}
            >
              原文
            </button>
            <button
              className={cn(
                "reading-view-toggle__btn",
                viewMode === "rewritten" && "reading-view-toggle__btn--active"
              )}
              onClick={() => setViewMode("rewritten")}
            >
              重写版
            </button>
          </div>
        ) : null}

        {/* 左右布局 */}
        <div className="reading-layout">
          <LeftPanel
            mode={mode}
            articleText={activeText}
            onSubmit={handleArticleSubmit}
            onEditAgain={handleEditAgain}
            contentWidth={contentWidth}
            onWidthChange={setContentWidth}
            onLinesReady={setArticleLines}
            selectedWords={selectedWords}
            onWordClick={handleWordClick}
          />
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
            onRewrite={showRewriteButton ? onRewriteClick : null}
            isAdding={isAddingToWordbook}
            isRewriting={isRewriting}
            rewriteError={rewriteError}
          />
        </div>
      </div>
      <TranslationDialog
        open={translationDialog.open}
        onClose={() => setTranslationDialog((s) => ({ ...s, open: false }))}
        text={translationDialog.text}
        apiCall={apiCall}
      />
    </Suspense>
  );
}
