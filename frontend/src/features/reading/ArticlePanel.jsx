/**
 * ArticlePanel.jsx — 文章主体渲染面板
 * ====================================
 * 结合 useRichLayout + VocabAnalyzer，CEFR 着色逐词渲染。
 * 当 rewriteMappings 非空时（重写版视图），显示原文对照悬浮提示。
 *
 * Props:
 *   text         {string}   — 文章纯文本
 *   contentWidth {number}   — 内容区最大宽度（px）
 *   onWidthChange {(w: number) => void}
 *   onWordClick  {(word: string, segment: RichSegment) => void}
 *   selectedWords {{ word: string, ... }[]}
 *   rewriteMappings {{original: string, rewritten: string}[]}
 */
import { BookOpenText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { readCefrLevel } from "../../app/authStorage";
import { useRichLayout } from "../../hooks/useRichLayout";
import "./reading.css";

const ARTICLE_FONT = "18px Inter";
const ARTICLE_LINE_HEIGHT = 30;

export function ArticlePanel({ text, contentWidth, onWidthChange, onWordClick, onLinesReady, selectedWords, activeLevels, rewriteMappings }) {
  const containerRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(contentWidth);
  const userLevel = readCefrLevel() || "B1";

  // Build lookup maps from rewrite mappings for fast per-segment resolution.
  const { rewrittenSet, rewrittenToOriginal } = useMemo(() => {
    const map = new Map();
    const set = new Set();
    for (const m of rewriteMappings ?? []) {
      const key = m.rewritten.toLowerCase();
      map.set(key, m.original);
      set.add(key);
    }
    return { rewrittenSet: set, rewrittenToOriginal: map };
  }, [rewriteMappings]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w <= 0) return;
        setMeasuredWidth(w);
        onWidthChange?.(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onWidthChange]);

  const { lines, isReady, error } = useRichLayout(text, measuredWidth, ARTICLE_FONT, ARTICLE_LINE_HEIGHT);

  // 布局完成后通知父组件（用于统计）
  useEffect(() => {
    if (isReady && lines.length > 0) {
      onLinesReady?.(lines);
    }
  }, [isReady, lines, onLinesReady]);

  if (!isReady) {
    return (
      <div ref={containerRef} className="article-panel">
        <ArticlePanelSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className="article-panel">
        <div className="article-panel-empty">
          <p className="article-panel-empty__title">加载失败</p>
          <p className="article-panel-empty__desc">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="article-panel">
      <div className="article-content">
        {lines.map((line, lineIdx) => {
          const isTitle = lineIdx === 0 && line.text.trim().length > 0 && !line.text.includes(".");
          return (
            <div
              key={lineIdx}
              className={cn("article-line", isTitle && "article-line--title")}
            >
              {line.segments.map((seg, segIdx) => {
                const isSelected = Boolean(
                  selectedWords?.some((w) => w.word === seg.text || w.word === seg.word)
                );
                const segWord = seg.word?.toLowerCase();
                const rewriteOriginal = rewriteMappings?.length && segWord
                  ? rewrittenToOriginal.get(segWord) ?? null
                  : null;
                return (
                  <ArticleWord
                    key={segIdx}
                    segment={seg}
                    userLevel={userLevel}
                    onWordClick={onWordClick}
                    isSelected={isSelected}
                    activeLevels={activeLevels}
                    rewriteOriginal={rewriteOriginal}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArticleWord({ segment, userLevel, onWordClick, isSelected, activeLevels, rewriteOriginal }) {
  const rawClass = computeCefrClassName(segment.cefrLevel, userLevel);
  // 如果 activeLevels 已配置，且当前词级不在其中，显示为已掌握（灰色）
  const cefrClass =
    activeLevels && activeLevels.length > 0 && segment.cefrLevel
      ? activeLevels.includes(segment.cefrLevel) ? rawClass : "cefr-mastered"
      : rawClass;
  const [animating, setAnimating] = useState(false);
  const prevSelected = useRef(isSelected);

  useEffect(() => {
    if (!prevSelected.current && isSelected) {
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 420);
      return () => clearTimeout(timer);
    }
    prevSelected.current = isSelected;
  }, [isSelected]);

  const handleClick = () => {
    const text = segment.text.trim();
    if (!text || /^[.!?,;:—–\-"''''""（）()[\]【】《》]+$/.test(text)) return;
    onWordClick?.(segment.text, segment);
  };

  const isRewritten = rewriteOriginal !== null && rewriteOriginal !== undefined;

  return (
    <span
      className={cn(
        "article-word",
        isRewritten ? "rewrite-highlight" : cefrClass,
        isSelected && "article-word--selected",
        animating && "article-word--success"
      )}
      onClick={handleClick}
      title={isRewritten ? `原文: ${rewriteOriginal}` : `${segment.cefrLevel || "未知等级"} — ${segment.text}`}
    >
      {segment.text}
      {isRewritten && (
        <span className="rewrite-tooltip">{rewriteOriginal}</span>
      )}
    </span>
  );
}

function ArticlePanelSkeleton() {
  const widths = [88, 72, 95, 60, 80, 68, 90, 55, 75, 85];
  return (
    <div className="article-content" aria-label="加载中">
      {widths.map((w, i) => (
        <div key={i} className="article-line" aria-hidden="true">
          <div
            className="h-5 animate-pulse rounded bg-muted"
            style={{ width: `${w}%`, animationDelay: `${i * 50}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * computeCefrClassName — 复刻 CefrBadge.jsx 逻辑
 * Logic:
 *   null/""      → cefr-mastered  (词不在表里 → gray)
 *   "SUPER"      → cefr-above-i-plus-one (red)
 *   wordLevel <= userLevel → cefr-mastered (gray)
 *   wordLevel == userLevel+1 → cefr-i-plus-one (teal)
 *   wordLevel >= userLevel+2 → cefr-above-i-plus-one (red)
 */
const CEFR_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];

function getLevelIndex(level) {
  const idx = CEFR_LEVEL_ORDER.indexOf(level);
  return idx === -1 ? 6 : idx;
}

export function computeCefrClassName(wordLevel, userLevel) {
  if (wordLevel === null || wordLevel === undefined || wordLevel === "") {
    return "cefr-mastered";
  }
  if (wordLevel === "SUPER") {
    return "cefr-above-i-plus-one";
  }
  const wordIdx = getLevelIndex(wordLevel);
  const userIdx = getLevelIndex(userLevel);
  if (wordIdx <= userIdx) return "cefr-mastered";
  if (wordIdx === userIdx + 1) return "cefr-i-plus-one";
  return "cefr-above-i-plus-one";
}
