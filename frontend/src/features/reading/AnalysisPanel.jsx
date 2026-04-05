/**
 * AnalysisPanel.jsx — 阅读板块右侧分析面板
 * ========================================
 * 替代原 WordSidebar，包含：
 * 1. 用户级别指示
 * 2. 难度分布条（从左到右 A1→A2→B1→B2→C1→C2→超纲）
 * 3. 级别过滤勾选（默认勾选 ≥ i+1）
 * 4. 生词列表（单词 + 级别标签 + 翻译按钮 + 加入生词本）
 * 5. 底部操作栏
 *
 * Props:
 *   selectedWords   {{ word: string, cefrLevel: string|null, cefrClass: string }[]}
 *   wordStats       {{ total: number, cefrCounts: Record<string,number> }|null}
 *   userLevel       {string} — 用户当前 CEFR 级别
 *   activeLevels    {string[]} — 当前激活的级别（用户勾选）
 *   onLevelToggle   {(level: string) => void}
 *   onRemove        {(item: WordItem) => void}
 *   onAddAllToWordbook {() => void}
 *   onClearAll      {() => void}
 *   onTranslate     {(item: WordItem) => void}
 *   onRewrite       {(() => void)|null}
 *   isAdding        {boolean}
 *   isRewriting     {boolean}
 *   rewriteError    {string|null}
 *   onRequestCollapse {() => void} — 收起右侧面板（由 ReadingPage 控制布局）
 */
import { BookPlus, BookOpenText, ChevronDown, Languages, Loader2, Unlock, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../shared/ui";

/* ─── 常量 ─────────────────────────────────────── */

const ALL_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];

const LEVEL_CONFIG = {
  A1: { label: "A1", barClass: "analysis-bar--a1", textColor: "analysis-level--a1", order: 0 },
  A2: { label: "A2", barClass: "analysis-bar--a2", textColor: "analysis-level--a2", order: 1 },
  B1: { label: "B1", barClass: "analysis-bar--b1", textColor: "analysis-level--b1", order: 2 },
  B2: { label: "B2", barClass: "analysis-bar--b2", textColor: "analysis-level--b2", order: 3 },
  C1: { label: "C1", barClass: "analysis-bar--c1", textColor: "analysis-level--c1", order: 4 },
  C2: { label: "C2", barClass: "analysis-bar--c2", textColor: "analysis-level--c2", order: 5 },
  SUPER: { label: "超纲", barClass: "analysis-bar--super", textColor: "analysis-level--super", order: 6 },
};

/** 根据用户级别计算默认激活的级别（≥ i+1） */
export function getDefaultActiveLevels(userLevel) {
  const userIdx = ALL_LEVELS.indexOf(userLevel);
  if (userIdx === -1) return ALL_LEVELS.slice(3); // 默认 B2+
  return ALL_LEVELS.slice(userIdx + 1);
}

/** 级别中文描述 */
function levelLabel(level) {
  return LEVEL_CONFIG[level]?.label ?? level;
}

/* ─── 难度分布条 ───────────────────────────────── */

function DifficultyBar({ stats, activeLevels, onLevelToggle }) {
  const counts = stats?.cefrCounts || {};
  const total = stats?.total || 1;

  return (
    <div className="analysis-section">
      <div className="analysis-bar">
        {ALL_LEVELS.map((lvl) => {
          const count = counts[lvl] || 0;
          const pct = Math.min(100, Math.max(0.5, (count / total) * 100));
          const isActive = activeLevels.includes(lvl);
          const cfg = LEVEL_CONFIG[lvl];
          return (
            <div
              key={lvl}
              className={cn("analysis-bar__segment", cfg.barClass, isActive && "analysis-bar__segment--active")}
              style={{ width: pct + "%", minWidth: count > 0 ? "18px" : "0px" }}
              title={`${levelLabel(lvl)}: ${count} 词 (${(count / total * 100).toFixed(1)}%)`}
              onClick={() => onLevelToggle?.(lvl)}
              role="button"
              aria-pressed={isActive}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onLevelToggle?.(lvl)}
            />
          );
        })}
      </div>
      <div className="analysis-bar__labels">
        {ALL_LEVELS.map((lvl) => {
          const count = counts[lvl] || 0;
          return (
            <div key={lvl} className="analysis-bar__label">
              <span className={cn("analysis-bar__label-dot", LEVEL_CONFIG[lvl].barClass)} />
              <span className="analysis-bar__label-text">{levelLabel(lvl)}</span>
              <span className="analysis-bar__label-count">{count > 0 ? count : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 级别过滤行 ───────────────────────────────── */

function LevelFilters({ userLevel, activeLevels, onLevelToggle }) {
  const isAboveIPlusOne = (lvl) => {
    const lvlIdx = ALL_LEVELS.indexOf(lvl);
    const userIdx = ALL_LEVELS.indexOf(userLevel);
    return lvlIdx > userIdx;
  };

  return (
    <div className="analysis-section">
      <div className="analysis-filters">
        <span className="analysis-filters__label">标注级别</span>
        <div className="analysis-filters__toggles">
          {ALL_LEVELS.map((lvl) => {
            const isActive = activeLevels.includes(lvl);
            const isIPlusOne = lvlIdx => {
              const userIdx = ALL_LEVELS.indexOf(userLevel);
              return lvlIdx === userIdx + 1;
            };
            const lvlIdx = ALL_LEVELS.indexOf(lvl);
            const isDefault = lvlIdx >= ALL_LEVELS.indexOf(userLevel) + 1;
            return (
              <button
                key={lvl}
                className={cn(
                  "analysis-filter-chip",
                  isActive && "analysis-filter-chip--active",
                  LEVEL_CONFIG[lvl].textColor
                )}
                onClick={() => onLevelToggle?.(lvl)}
                title={isDefault ? `${levelLabel(lvl)} (默认)` : levelLabel(lvl)}
              >
                {levelLabel(lvl)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── 生词列表 ─────────────────────────────────── */

function WordList({ selectedWords, onRemove, onTranslate, onAddAllToWordbook, isAdding }) {
  const count = selectedWords.length;

  // 按级别从高到低排序
  const sorted = [...selectedWords].sort((a, b) => {
    const idxA = ALL_LEVELS.indexOf(a.cefrLevel || "SUPER");
    const idxB = ALL_LEVELS.indexOf(b.cefrLevel || "SUPER");
    return idxB - idxA;
  });

  return (
    <div className="analysis-section analysis-section--word-list">
      <div className="analysis-word-list">
        {count === 0 ? (
          <div className="analysis-word-list__empty">
            <BookOpenText className="analysis-word-list__empty-icon" />
            <p className="analysis-word-list__empty-title">还没有选中词汇</p>
            <p className="analysis-word-list__empty-desc">
              点击文章中的词即可将其加入列表，轻松积累生词
            </p>
          </div>
        ) : (
          <>
            <div className="analysis-word-list__header">
              <span className="analysis-word-list__count">
                已选 {count} 词
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={onAddAllToWordbook}
                disabled={isAdding}
                className="analysis-word-list__add-all"
              >
                {isAdding ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <BookPlus className="size-3.5" />
                )}
                全部加入生词本
              </Button>
            </div>
            <div className="analysis-word-list__items">
              {sorted.map((item, idx) => (
                <AnalysisWordItem
                  key={item.word + idx}
                  item={item}
                  onRemove={onRemove}
                  onTranslate={onTranslate}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AnalysisWordItem({ item, onRemove, onTranslate }) {
  const cfg = LEVEL_CONFIG[item.cefrLevel] || LEVEL_CONFIG.SUPER;

  return (
    <div className={cn("analysis-word-item", `analysis-word-item--${item.cefrClass}`)}>
      <div className="analysis-word-item__main">
        <span className="analysis-word-item__word">{item.word}</span>
        <span className={cn("analysis-word-item__level", cfg.textColor)}>
          {levelLabel(item.cefrLevel)}
        </span>
      </div>
      <div className="analysis-word-item__actions">
        {onTranslate ? (
          <button
            className="analysis-word-item__action"
            onClick={() => onTranslate(item)}
            title="查看翻译"
            aria-label={"翻译 " + item.word}
          >
            <Languages className="size-3.5" />
          </button>
        ) : null}
        <button
          className="analysis-word-item__remove"
          onClick={() => onRemove(item)}
          aria-label={"移除 " + item.word}
          title={"移除 " + item.word}
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}

/* ─── AnalysisPanel 主组件 ─────────────────────── */

export function AnalysisPanel({
  selectedWords = [],
  wordStats = null,
  userLevel = "B1",
  activeLevels = [],
  onLevelToggle,
  onRemove,
  onAddAllToWordbook,
  onClearAll,
  onTranslate,
  onRewrite,
  isAdding = false,
  isRewriting = false,
  rewriteError = null,
  onRequestCollapse,
}) {
  return (
    <aside className="analysis-panel">
      <div className="analysis-panel__chrome">
        <h2 className="analysis-panel__heading">等级词汇表</h2>
        {onRequestCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="analysis-panel__collapse text-muted-foreground hover:text-foreground shrink-0"
            onClick={onRequestCollapse}
            aria-expanded
            aria-label="收起等级词汇表"
            title="收起"
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {/* 用户级别指示 */}
      <div className="analysis-panel__user-level">
        <span className="analysis-panel__user-level-label">你的级别</span>
        <span className="analysis-panel__user-level-value">{userLevel}</span>
      </div>

      {/* 难度分布条 */}
      {wordStats && wordStats.total > 0 ? (
        <DifficultyBar stats={wordStats} activeLevels={activeLevels} onLevelToggle={onLevelToggle} />
      ) : null}

      {/* 级别过滤 */}
      <LevelFilters userLevel={userLevel} activeLevels={activeLevels} onLevelToggle={onLevelToggle} />

      {/* 重写中 / 错误提示 */}
      {isRewriting ? (
        <div className="analysis-panel__rewriting-hint">
          <Loader2 className="size-3.5 animate-spin" />
          <span>AI 重写中...</span>
        </div>
      ) : null}

      {rewriteError ? (
        <div className="analysis-panel__rewrite-error" role="alert">
          <span className="analysis-panel__rewrite-error-title">上次操作未成功</span>
          <p className="analysis-panel__rewrite-error-msg">{rewriteError}</p>
        </div>
      ) : null}

      {/* 操作按钮行 */}
      <div className="analysis-panel__actions">
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearAll}
          className="text-xs text-muted-foreground h-7 px-2"
        >
          清空选择
        </Button>
        {onRewrite !== null && onRewrite !== undefined ? (
          <Button
            size="sm"
            className="btn-unlock"
            onClick={onRewrite}
            disabled={isRewriting}
          >
            {isRewriting ? (
              <Loader2 className="size-4 btn-unlock__icon--spin" />
            ) : (
              <Unlock className="size-4" />
            )}
            Unlock
          </Button>
        ) : null}
      </div>

      {/* 生词列表 */}
      <WordList
        selectedWords={selectedWords}
        onRemove={onRemove}
        onAddAllToWordbook={onAddAllToWordbook}
        isAdding={isAdding}
        onTranslate={onTranslate}
      />
    </aside>
  );
}
