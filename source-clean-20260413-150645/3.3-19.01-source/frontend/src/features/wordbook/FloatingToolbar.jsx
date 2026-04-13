import { Trash2, Archive, Move, X } from "lucide-react";
import { Button, Separator } from "../../shared/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

export function FloatingToolbar({
  selectedCount,
  onDelete,
  onArchive,
  onMove,
  onClear,
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      {/* Fixed position at viewport top, outside scrollable containers */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pt-3 pointer-events-auto">
          <div className="flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg px-4 py-2">
            <span className="text-sm font-medium">{selectedCount} 项已选中</span>
            <Separator orientation="vertical" className="h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDelete}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4 mr-1" />
                  删除
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
                <p>删除选中的词条</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onArchive}
                >
                  <Archive className="size-4 mr-1" />
                  归档
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
                <p>将选中词条标记为已掌握</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onMove}
                >
                  <Move className="size-4 mr-1" />
                  移动到
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
                <p>将选中的词条移动到其他课程</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="text-muted-foreground"
            >
              <X className="size-4 mr-1" />
              取消
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
