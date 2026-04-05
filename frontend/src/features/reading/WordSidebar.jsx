/**
 * WordSidebar.jsx — 阅读板块右侧词边栏
 * =====================================
 * 受控组件，接收 selectedWords 列表和操作回调。
 *
 * Props:
 *   selectedWords  {{ word: string, cefrLevel: string|null, cefrClass: string }[]}
 *   wordStats     {{ total: number, cefrCounts: Record<string,number> }|null}
 *   onRemove      {(item: WordItem) => void}
 *   onAddAllToWordbook {() => void}
 *   onClearAll    {() => void}
 *   onTranslate   {(item: WordItem) => void}
 *   isAdding      {boolean}
 */
import { BookPlus, BookOpenText, Languages, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../shared/ui";

export function WordSidebar({
  selectedWords = [],
  wordStats = null,
  onRemove,
  onAddAllToWordbook,
  onClearAll,
  onTranslate,
  isAdding = false,
}) {
  const count = selectedWords.length;

  return (
    <aside className="word-sidebar">
      {wordStats && wordStats.total > 0 ? (
        <WordSidebarStats stats={wordStats} />
      ) : null}

      <div className="word-sidebar__header">
        <span className="word-sidebar__title">
          已选词汇
          {count > 0 ? <span className="word-sidebar__count">({count})</span> : null}
        </span>
        <div className="word-sidebar__header-actions">
          {count > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearAll}
              className="text-xs text-muted-foreground h-7 px-2"
            >
              清空
            </Button>
          ) : null}
          {count > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onAddAllToWordbook}
              disabled={isAdding}
              className="word-sidebar__add-all"
            >
              {isAdding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BookPlus className="size-4" />
              )}
              加入生词本
            </Button>
          ) : null}
        </div>
      </div>

      <div className="word-sidebar__list">
        {count === 0 ? (
          <div className="word-sidebar__empty">
            <BookOpenText className="word-sidebar__empty-icon size-8" />
            <p className="word-sidebar__empty-title">还没有选中词汇</p>
            <p className="word-sidebar__empty-desc">
              点击文章中的词即可将其加入列表，轻松积累生词
            </p>
          </div>
        ) : (
          selectedWords.map((item, idx) => (
            <WordSidebarItem
              key={item.word + idx}
              item={item}
              onRemove={onRemove}
              onTranslate={onTranslate}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function WordSidebarItem({ item, onRemove, onTranslate }) {
  return (
    <div className="word-sidebar-item word-sidebar-item--selected">
      <div className="word-sidebar-item__main">
        <span className="word-sidebar-item__word">{item.word}</span>
        <span
          className={cn(
            "word-sidebar-item__level",
            `word-sidebar-item__level--${item.cefrClass}`
          )}
        >
          {item.cefrLevel || "?"}
        </span>
      </div>
      <div className="word-sidebar-item__actions">
        {onTranslate ? (
          <button
            className="word-sidebar-item__action"
            onClick={() => onTranslate(item)}
            title="查看翻译"
            aria-label={"翻译 " + item.word}
          >
            <Languages className="size-3.5" />
          </button>
        ) : null}
        <button
          className="word-sidebar-item__remove"
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

const STAT_LEVELS = [
  {
    key: "B1",
    label: "B1",
    barClass: "word-sidebar-stat--b1",
    dotClass: "word-sidebar-stat-dot--b1",
  },
  {
    key: "B2",
    label: "B2",
    barClass: "word-sidebar-stat--b2",
    dotClass: "word-sidebar-stat-dot--b2",
  },
  {
    key: "C1",
    label: "C1",
    barClass: "word-sidebar-stat--c1",
    dotClass: "word-sidebar-stat-dot--c1",
  },
  {
    key: "C2",
    label: "C2",
    barClass: "word-sidebar-stat--c2",
    dotClass: "word-sidebar-stat-dot--c2",
  },
  {
    key: "SUPER",
    label: "超纲",
    barClass: "word-sidebar-stat--super",
    dotClass: "word-sidebar-stat-dot--super",
  },
];

function WordSidebarStats({ stats }) {
  const counts = stats.cefrCounts || {};
  const total = stats.total || 1;
  const nonZeroLevels = STAT_LEVELS.filter((l) => (counts[l.key] || 0) > 0);

  return (
    <div className="word-sidebar-stats">
      <div className="word-sidebar-stats__title">文章难度分布</div>
      <div className="word-sidebar-stats__bar">
        {STAT_LEVELS.map((lvl) => {
          const count = counts[lvl.key] || 0;
          const pct = (count / total) * 100;
          return pct > 0 ? (
            <div
              key={lvl.key}
              className={cn("word-sidebar-stat", lvl.barClass)}
              style={{ width: pct + "%" }}
              title={lvl.label + ": " + count + " 词"}
            />
          ) : null;
        })}
      </div>
      {nonZeroLevels.length > 0 ? (
        <div className="word-sidebar-stats__legend">
          {nonZeroLevels.map((lvl) => {
            const count = counts[lvl.key] || 0;
            return (
              <span key={lvl.key} className="word-sidebar-stat-badge">
                <span className={cn("word-sidebar-stat-dot", lvl.dotClass)} />
                {lvl.label} {count}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
