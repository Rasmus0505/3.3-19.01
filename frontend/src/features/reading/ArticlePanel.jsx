/**
 * ArticlePanel.jsx — 文章主体渲染面板
 * ====================================
 * 结合 useRichLayout + VocabAnalyzer，CEFR 着色逐词渲染。
 *
 * Props:
 *   text           {string}   — 文章纯文本（原文或重写版）
 *   contentWidth   {number}   — 内容区最大宽度（px）
 *   onWidthChange  {(w: number) => void}
 *   onWordClick    {(word: string, segment: RichSegment) => void}
 *   onLinesReady   {(lines: RichLine[]) => void}
 *   selectedWords  {{ word: string, ... }[]}
 *   activeLevels   {string[]}
 *   rewriteMappings {{original: string, rewritten: string, confirmed: boolean, originalLevel: string}[]}
 *   viewMode       {'original'|'rewritten'} — 决定渲染方式
 */
import { BookOpenText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { readCefrLevel } from "../../app/authStorage";
import { useRichLayout } from "../../hooks/useRichLayout";
import "./reading.css";

const ARTICLE_FONT = "18px Inter";
const ARTICLE_LINE_HEIGHT = 30;

export function ArticlePanel({
  text,
  contentWidth,
  onWidthChange,
  onWordClick,
  onLinesReady,
  selectedWords,
  activeLevels,
  rewriteMappings,
  viewMode = "original",
}) {
  const containerRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(contentWidth);
  const userLevel = readCefrLevel() || "B1";

  // Build lookup maps from rewrite mappings for fast per-segment resolution.
  // Key = lower-case word, for case-insensitive matching.
  const { confirmedOriginals, allRewrittenSet } = useMemo(() => {
    const confirmed = new Map();   // rewritten → original (only confirmed)
    const allSet = new Set();       // all rewritten words (for tooltip)
    for (const m of rewriteMappings ?? []) {
      const rewrittenKey = m.rewritten.toLowerCase();
      allSet.add(rewrittenKey);
      if (m.confirmed) {
        confirmed.set(rewrittenKey, m.original);
      }
    }
    return { confirmedOriginals: confirmed, allRewrittenSet: allSet };
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
                const segWord = (seg.word || seg.text || "").toLowerCase();

                // 判断是否为需要简化的词（confirmed 映射中的原文词）
                const isConfirmed = (() => {
                  for (const m of rewriteMappings ?? []) {
                    if (m.original.toLowerCase() === segWord) return m.confirmed;
                  }
                  return false;
                })();

                return (
                  <ArticleWord
                    key={segIdx}
                    segment={seg}
                    userLevel={userLevel}
                    onWordClick={onWordClick}
                    isSelected={isSelected}
                    activeLevels={activeLevels}
                    isConfirmedSimplify={isConfirmed}
                    rewriteMappings={rewriteMappings}
                    viewMode={viewMode}
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

function ArticleWord({ segment, userLevel, onWordClick, isSelected, activeLevels, isConfirmedSimplify, rewriteMappings, viewMode }) {
  const rawClass = computeCefrClassName(segment.cefrLevel, userLevel);

  // viewMode === 'rewritten'：全部词无 CEFR 下划线
  // viewMode === 'original'：
  //   - confirmed=true 的词：有下划线 + tooltip 显示简化对照
  //   - confirmed=false 的词：无下划线（词典等级过低，不需要简化）
  // activeLevels 也控制基础着色（灰色 = 已掌握的等级）
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

  // 在 rewriteMappings 中查找对应的简化对照
  const segWord = (segment.word || segment.text || "").toLowerCase();
  const mapping = rewriteMappings?.find(
    (m) => m.original.toLowerCase() === segWord
  );

  // 判断视觉样式
  const isSimplifiedWord = mapping?.confirmed && viewMode === "rewritten";
  const showUnderline = viewMode === "original" && isConfirmedSimplify;

  return (
    <span
      className={cn(
        "article-word",
        // 重写版：黄色背景（仅简化词）或无样式（其余）
        isSimplifiedWord && "article-word--simplified",
        !isSimplifiedWord && viewMode === "rewritten" && "article-word--rewritten-normal",
        // 原文版：CEFR 下划线（仅 confirmed=true）
        viewMode === "original" && (showUnderline ? cefrClass : "cefr-mastered"),
        isSelected && "article-word--selected",
        animating && "article-word--success"
      )}
      onClick={handleClick}
      title={
        viewMode === "original" && mapping?.confirmed
          ? `原文: ${mapping.original} → 简化: ${mapping.rewritten}`
          : `${segment.cefrLevel || "未知等级"} — ${segment.text}`
      }
    >
      {segment.text}
      {/* 原文 hover 时显示简化对照 tooltip */}
      {viewMode === "original" && mapping?.confirmed && (
        <span className="rewrite-tooltip">{mapping.rewritten}</span>
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
