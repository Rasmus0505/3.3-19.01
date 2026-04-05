/**
 * LeftPanel.jsx — 阅读板块左侧面板
 * =================================
 * 两种模式：
 * - 输入模式（空状态 / 有内容）：textarea 可粘贴/输入
 * - 阅读模式：渲染 ArticlePanel，带「重新输入」按钮
 *
 * Props:
 *   mode           {'input'|'reading'}
 *   articleText    {string} — 当前文章文本（阅读模式使用）
 *   onSubmit       {(text: string) => void} — 提交文章，切换到阅读模式
 *   onEditAgain    {() => void} — 重新输入
 *   contentWidth   {number}
 *   onWidthChange  {(w: number) => void}
 *   articleLines   {RichLine[]} — 传给 ArticlePanel 的行数据
 *   onLinesReady   {(lines: RichLine[]) => void}
 *   selectedWords  {WordItem[]}
 *   onWordClick    {(word, segment) => void}
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import "./reading.css";

const ArticlePanel = lazy(() => import("./ArticlePanel").then((m) => ({ default: m.ArticlePanel })));

/* ─── 输入模式占位提示 ─────────────────────────── */

function InputPlaceholder() {
  return (
    <div className="left-panel__placeholder">
      <div className="left-panel__placeholder-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <line x1="11" y1="15" x2="29" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="25" x2="21" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="left-panel__placeholder-title">粘贴或输入英文文章</p>
      <p className="left-panel__placeholder-hint">
        直接在下方输入框粘贴文章，自动进行 CEFR 难度分析
      </p>
    </div>
  );
}

/* ─── 重新输入按钮 ─────────────────────────────── */

function EditAgainButton({ onClick }) {
  return (
    <button className="left-panel__edit-again" onClick={onClick}>
      重新输入
    </button>
  );
}

/* ─── LeftPanel ───────────────────────────────── */

export function LeftPanel({
  mode,
  articleText,
  onSubmit,
  onEditAgain,
  contentWidth,
  onWidthChange,
  onLinesReady,
  selectedWords,
  onWordClick,
  activeLevels,
}) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const submitTimerRef = useRef(null);

  // 当 mode 变 input 时清空草稿
  useEffect(() => {
    if (mode === "input") {
      // keep last draft for user convenience, don't clear
    }
  }, [mode]);

  // 400ms debounce auto-submit
  const handleDraftChange = useCallback(
    (value) => {
      setDraft(value);
      draftRef.current = value;
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
      submitTimerRef.current = setTimeout(() => {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed !== articleText) {
          onSubmit(trimmed);
        }
      }, 400);
    },
    [onSubmit, articleText]
  );

  const handleKeyDown = useCallback(
    (e) => {
      // Ctrl/Cmd+Enter 立即提交
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const trimmed = draftRef.current.trim();
        if (trimmed) {
          if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
          onSubmit(trimmed);
        }
      }
    },
    [onSubmit]
  );

  const charCount = draft.length;
  const hasContent = draft.trim().length > 0;

  if (mode === "reading") {
    return (
      <div className="left-panel left-panel--reading">
        <div className="left-panel__reading-area">
          <Suspense fallback={<LeftPanelSkeleton />}>
            <ArticlePanel
              text={articleText}
              contentWidth={contentWidth}
              onWidthChange={onWidthChange}
              onWordClick={onWordClick}
              onLinesReady={onLinesReady}
              selectedWords={selectedWords}
              activeLevels={activeLevels}
            />
          </Suspense>
        </div>
        <EditAgainButton onClick={onEditAgain} />
      </div>
    );
  }

  // mode === 'input'
  return (
    <div className="left-panel left-panel--input">
      {!hasContent && <InputPlaceholder />}
      <div className={cn("left-panel__input-area", !hasContent && "left-panel__input-area--empty")}>
        <textarea
          className="left-panel__textarea"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder=""
          spellCheck={false}
          autoFocus
          aria-label="输入或粘贴英文文章"
        />
        {hasContent && (
          <div className="left-panel__input-footer">
            <span className="left-panel__char-count">{charCount} 字符</span>
            <span className="left-panel__hint">Ctrl+Enter 立即分析</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LeftPanelSkeleton() {
  const widths = [88, 72, 95, 60, 80, 68, 90, 55, 75, 85];
  return (
    <div className="article-panel">
      <div className="article-content">
        {widths.map((w, i) => (
          <div key={i} className="article-line" aria-hidden="true">
            <div
              className="h-5 animate-pulse rounded bg-muted"
              style={{ width: `${w}%`, animationDelay: `${i * 50}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
