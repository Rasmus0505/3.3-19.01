/**
 * ArticlePanel.jsx — 文章主体渲染面板
 * ====================================
 * 结合 useRichLayout + VocabAnalyzer，Collins 着色逐词渲染。
 *
 * 新流程 v2 (Phase 35):
 * - 原文视图：i+1 绿色下划线、>i+1 红色下划线、重写词黄色块+悬浮原文
 * - 重写版视图：简化后全文
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
 *   validI1Words  {string[]}  — 有效的 i+1 词汇列表（DeepSeek 验证通过）
 *   validAboveI1Words {string[]} — 有效的 >i+1 词汇列表（需要简化的）
 *   removedWords  {object[]}  — 被过滤的词汇 [{word, reason}]（词典误标等原因）
 *   wordLevels    {object}    — 二次筛选后的最终等级 {wordLower: level}
 *   viewMode       {'original'|'rewritten'} — 决定渲染方式
 */
import { BookOpenText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { readCollinsLevel } from "../../app/authStorage";
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
  validI1Words = [],
  validAboveI1Words = [],
  removedWords = [],
  wordLevels = {},
  collinsBandMap = {},
  viewMode = "original",
}) {
  const containerRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(contentWidth);
  const userLevel = readCollinsLevel() || 3;

  // #region agent log
  const _scanNonStrings = (arr, label) =>
    (arr || []).map((x, i) => ({
      i,
      type: typeof x,
      val:
        x == null
          ? null
          : typeof x === "object"
          ? Object.keys(x || {})
          : typeof x === "string"
          ? x.slice(0, 80)
          : x,
    })).filter((o) => o.type !== "string");
  const _badI1 = _scanNonStrings(validI1Words, "i1");
  const _badAbove = _scanNonStrings(validAboveI1Words, "above");
  const _badRemoved = _scanNonStrings(removedWords, "removed");
  const _badMapOrig = (rewriteMappings || []).map((m, i) => ({ i, origType: typeof m?.original })).filter((o) => o.origType !== "string");
  if (_badI1.length || _badAbove.length || _badRemoved.length || _badMapOrig.length) {
    fetch("http://127.0.0.1:7741/ingest/66ae8bbb-d4f3-40a4-b6d9-17b56f3fcb44", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "8a4a54" },
      body: JSON.stringify({
        sessionId: "8a4a54",
        location: "ArticlePanel.jsx:pre-sets",
        message: "toLowerCase risk scan",
        data: {
          badI1: _badI1,
          badAbove: _badAbove,
          badRemoved: _badRemoved,
          badMappingOriginal: _badMapOrig,
        },
        timestamp: Date.now(),
        hypothesisId: _badRemoved.length ? "H1-removed-objects" : _badI1.length || _badAbove.length ? "H1-word-arrays" : "H2-mapping-original",
      }),
    }).catch(() => {});
  }
  // #endregion

  // ── 规范化：后端 removed_words 是 [{word,reason}] 对象数组 ──────────────────
  // normalizeToStrings() 把对象只取 .word 字段，其余类型强制 toString，空值过滤
  const normalizeToStrings = (arr) =>
    (arr || [])
      .map((x) => (typeof x === "object" && x !== null ? String(x.word ?? "") : String(x ?? "")))
      .filter((s) => s.length > 0);

  const normI1 = normalizeToStrings(validI1Words);
  const normAbove = normalizeToStrings(validAboveI1Words);
  const normRemoved = normalizeToStrings(removedWords);

  // 构建 Set 用于快速查找
  const validI1Set = useRef(new Set(normI1.map((w) => w.toLowerCase())));
  const validAboveI1Set = useRef(new Set(normAbove.map((w) => w.toLowerCase())));
  const removedWordsSet = useRef(new Set(normRemoved.map((w) => w.toLowerCase())));

  // 当 props 变化时更新 Set（使用规范化后的数组）
  useEffect(() => {
    validI1Set.current = new Set(normalizeToStrings(validI1Words).map((w) => w.toLowerCase()));
  }, [validI1Words]);

  useEffect(() => {
    validAboveI1Set.current = new Set(normalizeToStrings(validAboveI1Words).map((w) => w.toLowerCase()));
  }, [validAboveI1Words]);

  useEffect(() => {
    removedWordsSet.current = new Set(normalizeToStrings(removedWords).map((w) => w.toLowerCase()));
  }, [removedWords]);

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
                return (
                  <ArticleWord
                    key={segIdx}
                    segment={seg}
                    userLevel={userLevel}
                    onWordClick={onWordClick}
                    isSelected={isSelected}
                    activeLevels={activeLevels}
                    rewriteMappings={rewriteMappings}
                    validI1Set={validI1Set.current}
                    validAboveI1Set={validAboveI1Set.current}
                    removedWordsSet={removedWordsSet.current}
                    wordLevels={wordLevels}
                    collinsBandMap={collinsBandMap}
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

function ArticleWord({
  segment,
  userLevel,
  onWordClick,
  isSelected,
  activeLevels,
  rewriteMappings,
  validI1Set,
  validAboveI1Set,
  removedWordsSet,
  wordLevels,
  collinsBandMap,
  viewMode,
}) {
  const segText = (segment.text || "").trim();
  const segLower = segText.toLowerCase();
  const resolvedLevel = wordLevels?.[segLower] || segment.levelBand || null;

  // 重写版：按 original 匹配（applySimplifiedWords 已替换为简化词）
  // 原文视图：按 originalLower 匹配（原始词形）
  const mapping = rewriteMappings?.find((m) => {
    if (typeof m !== "object" || m === null) return false;
    if (viewMode === "rewritten") {
      return m.confirmed && typeof m.original === "string" && m.original.toLowerCase() === segLower;
    }
    return typeof m.originalLower === "string" && m.originalLower === segLower;
  });

  // 原文视图：根据 validI1Set 和 validAboveI1Set 判断渲染样式
  let difficultyClass = "";
  let isI1Word = false;
  let isAboveI1Word = false;

  if (viewMode === "original") {
    const collinsBand = collinsBandMap?.[segLower] || collinsBandMap?.[segment.word?.toLowerCase?.() || ""];
    if (collinsBand) {
      difficultyClass = computeDifficultyClassName(collinsBand, userLevel);
      isI1Word = collinsBand === "i_plus_one";
      isAboveI1Word = collinsBand === "above_i_plus_one";
    } else {
    // 优先判断是否是 i+1 或 >i+1 词（DeepSeek 验证通过的）
    isI1Word = validI1Set.has(segLower);
    isAboveI1Word = validAboveI1Set.has(segLower);
    const isRemovedWord = removedWordsSet?.has(segLower);

    if (isI1Word) {
      difficultyClass =
        activeLevels && activeLevels.length > 0
          ? activeLevels.includes(resolvedLevel) ? "difficulty-i-plus-one" : "difficulty-default"
          : "difficulty-i-plus-one";
    } else if (isAboveI1Word) {
      difficultyClass =
        activeLevels && activeLevels.length > 0
          ? activeLevels.includes(resolvedLevel) ? "difficulty-above-i-plus-one" : "difficulty-default"
          : "difficulty-above-i-plus-one";
    } else if (isRemovedWord) {
      // DeepSeek 过滤掉的词 → 过于简单，不标下划线
      difficultyClass = "difficulty-default";
    }
    }
    // 注意：不在 DeepSeek 有效词列表中的词，不标下划线
    // 下划线只基于二次筛选结果，不再依赖旧词典初筛等级
  }

  // 重写版渲染逻辑
  const isSimplifiedWord = viewMode === "rewritten" && mapping?.confirmed;

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
    onWordClick?.(segment.text, { ...segment, difficultyLevel: resolvedLevel });
  };

  // 构建 className
  const classNames = cn(
    "article-word",
    // 重写版样式
    isSimplifiedWord && "article-word--simplified",
    !isSimplifiedWord && viewMode === "rewritten" && "article-word--rewritten-normal",
    // 原文视图 Collins 样式
    viewMode === "original" && difficultyClass,
    // 选中态
    isSelected && "article-word--selected",
    animating && "article-word--success"
  );

  // 构建 tooltip
  let tooltipText = "";
  if (viewMode === "rewritten" && mapping?.confirmed) {
    tooltipText = `原文: ${mapping.rewritten}`;
  } else if (viewMode === "original" && mapping?.confirmed) {
    tooltipText = `已简化为: ${mapping.rewritten}`;
  } else if (isI1Word) {
    tooltipText = `${resolvedLevel || "i+1"} — ${segment.text}（可学习词汇）`;
  } else if (isAboveI1Word) {
    tooltipText = `${resolvedLevel || ">i+1"} — ${segment.text}（建议简化）`;
  } else {
    const effectiveLevel = mapping?.finalLevel || resolvedLevel;
    tooltipText = `${effectiveLevel || "未知等级"} — ${segment.text}`;
  }

  return (
    <span
      className={classNames}
      onClick={handleClick}
      title={tooltipText}
    >
      {isSimplifiedWord ? mapping.original : segment.text}
      {/* 原文视图 hover 时显示简化对照 tooltip */}
      {viewMode === "original" && mapping?.confirmed && (
        <span className="rewrite-tooltip">{mapping.rewritten}</span>
      )}
      {/* 重写版 hover 时显示原词 + 等级 tooltip */}
      {viewMode === "rewritten" && mapping?.confirmed && (
        <span className="rewrite-tooltip">
          原词: {mapping.rewritten}
          {(mapping.finalLevel || resolvedLevel) && ` (${mapping.finalLevel || resolvedLevel})`}
        </span>
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
 * computeDifficultyClassName — 复刻 DifficultyBadge.jsx 逻辑
 * Logic:
 *   null/""      → difficulty-default  (词不在表里 → gray)
 *   "SUPER"      → difficulty-above-i-plus-one (red)
 *   wordLevel <= userLevel → difficulty-default (gray)
 *   wordLevel == userLevel+1 → difficulty-i-plus-one (teal)
 *   wordLevel >= userLevel+2 → difficulty-above-i-plus-one (red)
 */
const LEGACY_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];
const COLLINS_BANDS = new Set(["default", "i_plus_one", "above_i_plus_one", "unrated"]);

function getLevelIndex(level) {
  const idx = LEGACY_LEVEL_ORDER.indexOf(level);
  return idx === -1 ? 6 : idx;
}

export function computeDifficultyClassName(wordLevel, userLevel) {
  if (COLLINS_BANDS.has(String(wordLevel || ""))) {
    if (wordLevel === "i_plus_one") return "difficulty-i-plus-one";
    if (wordLevel === "above_i_plus_one") return "difficulty-above-i-plus-one";
    return "difficulty-default";
  }
  if (typeof wordLevel === "number" && Number.isFinite(Number(userLevel))) {
    const wordValue = Number(wordLevel);
    const userValue = Number(userLevel);
    if (wordValue >= userValue) return "difficulty-default";
    if (wordValue === userValue - 1) return "difficulty-i-plus-one";
    return "difficulty-above-i-plus-one";
  }
  if (wordLevel === null || wordLevel === undefined || wordLevel === "") {
    return "difficulty-default";
  }
  if (wordLevel === "SUPER") {
    return "difficulty-above-i-plus-one";
  }
  const wordIdx = getLevelIndex(wordLevel);
  const userIdx = getLevelIndex(userLevel);
  if (wordIdx <= userIdx) return "difficulty-default";
  if (wordIdx === userIdx + 1) return "difficulty-i-plus-one";
  return "difficulty-above-i-plus-one";
}


