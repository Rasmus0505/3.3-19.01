import { Trash2 } from "lucide-react";

import { Button } from "../../../shared/ui";

export function LessonHistoryToolbar({
  allHistorySelected,
  selectedCount,
  excludedLessonCount,
  hasSelection,
  deleteBusy,
  bulkDeleteEnabled,
  onClearSelection,
  onSelectAllHistory,
  onOpenBulkDelete,
}) {
  return (
    <div className="sticky top-14 z-10 rounded-2xl border bg-background/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85 md:top-16 md:px-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {allHistorySelected ? (
            <Button type="button" variant="outline" onClick={onClearSelection} disabled={deleteBusy}>
              取消全选
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onSelectAllHistory} disabled={deleteBusy}>
              全选全部历史
            </Button>
          )}
          {hasSelection ? (
            <p className="text-sm text-muted-foreground">
              {allHistorySelected
                ? excludedLessonCount > 0
                  ? `已选其余 ${selectedCount} 项，已排除 ${excludedLessonCount} 项`
                  : `已选全部历史 ${selectedCount} 项`
                : `已选 ${selectedCount} 项`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">选择要删除的记录</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full sm:w-auto"
            disabled={!hasSelection || deleteBusy || !bulkDeleteEnabled}
            onClick={onOpenBulkDelete}
          >
            <Trash2 className="size-4" />
            批量删除
          </Button>
        </div>
      </div>
    </div>
  );
}


