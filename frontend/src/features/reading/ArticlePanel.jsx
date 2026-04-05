/**
 * ArticlePanel.jsx — 文章主体渲染面板
 * ====================================
 * 结合 useRichLayout + VocabAnalyzer，CEFR 着色逐词渲染。
 *
 * Props:
 *   text         {string}   — 文章纯文本
 *   contentWidth {number}   — 内容区最大宽度（px）
 *   onWidthChange {(w: number) => void}
 *   onWordClick  {(word: string, segment: RichSegment) => void}
 *   selectedWords {{ word: string, ... }[]}
 */
import { BookOpenText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { readCefrLevel } from "../../app/authStorage";
import { useRichLayout } from "../../hooks/useRichLayout";
import "./reading.css";

const ARTICLE_FONT = "18px Inter";
const ARTICLE_LINE_HEIGHT = 30;

export function ArticlePanel({ text, contentWidth, onWidthChange, onWordClick, selectedWords }) {
  const containerRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(contentWidth);
  const userLevel = readCefrLevel() || "B1";

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
                return (
                  <ArticleWord
                    key={segIdx}
                    segment={seg}
                    userLevel={userLevel}
                    onWordClick={onWordClick}
                    isSelected={isSelected}
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

function ArticleWord({ segment, userLevel, onWordClick, isSelected }) {
  const cefrLevel = segment.cefrLevel;
  const cefrClass = computeCefrClassName(cefrLevel, userLevel);
  return (
    <span
      className={cn("article-word", cefrClass, isSelected && "article-word--selected")}
      onClick={() => onWordClick?.(segment.text, segment)}
      title={`${segment.cefrLevel || "未知等级"} — ${segment.text}`}
    >
      {segment.text}
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
