/**
 * WordSidebar.jsx — 阅读板块右侧词边栏
 * =====================================
 * 受控组件，接收 selectedWords 列表和操作回调。
 *
 * Props:
 *   selectedWords  {{ word: string, cefrLevel: string|null, cefrClass: string }[]}
 *   onRemove       {(item: WordItem) => void}
 *   onAddAllToWordbook {() => void}
 */
import { BookPlus, BookOpenText, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../shared/ui";

export function WordSidebar({ selectedWords = [], onRemove, onAddAllToWordbook }) {
  const count = selectedWords.length;

  return (
    <aside className="word-sidebar">
      <div className="word-sidebar__header">
        <span className="word-sidebar__title">已选词汇</span>
        {count > 0 && (
          <span className="word-sidebar__count">{count}</span>
        )}
        {count > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={onAddAllToWordbook}
            className="word-sidebar__add-all"
          >
            <BookPlus className="size-4" />
            加入生词本
          </Button>
        )}
      </div>

      <div className="word-sidebar__list">
        {count === 0 ? (
          <div className="word-sidebar__empty">
            <BookOpenText className="word-sidebar__empty-icon size-8" />
            <p className="word-sidebar__empty-title">还没有选中词汇</p>
            <p className="word-sidebar__empty-desc">点击文章中的词即可将其加入列表，轻松积累生词</p>
          </div>
        ) : (
          selectedWords.map((item, idx) => (
            <WordSidebarItem key={item.word + idx} item={item} onRemove={onRemove} />
          ))
        )}
      </div>
    </aside>
  );
}

function WordSidebarItem({ item, onRemove }) {
  return (
    <div className="word-sidebar-item">
      <div className="word-sidebar-item__main">
        <span className="word-sidebar-item__word">{item.word}</span>
        <span className={cn("word-sidebar-item__level", `word-sidebar-item__level--${item.cefrClass}`)}>
          {item.cefrLevel || "?"}
        </span>
      </div>
      <button
        className="word-sidebar-item__remove"
        onClick={() => onRemove(item)}
        aria-label={`移除 ${item.word}`}
        title={`移除 ${item.word}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
