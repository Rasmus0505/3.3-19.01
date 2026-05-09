// 任务状态卡片组件。

import { RefreshCcw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../../shared/ui";

interface UploadTaskStatusCardProps {
  show: boolean;
  surfaceClassName: string;
  textClassName: string;
  recoverableButtonClassName: string;
  selectedButtonSubtleClassName: string;
  selectedButtonClassName: string;
  statusText: string;
  restoreBannerMode: string;
  canResumeServerTask: boolean;
  canReconnectInterruptedTask: boolean;
  taskPaused: boolean;
  onResumeOrReconnect: () => void;
  onRestart: () => void;
  onClear: () => void;
}

export const RESTORE_BANNER_MODES = {
  NONE: "none",
  INTERRUPTED: "interrupted",
  STALE: "stale",
  VERIFYING: "verifying",
};

export function UploadTaskStatusCard({
  show,
  surfaceClassName,
  textClassName,
  recoverableButtonClassName,
  selectedButtonSubtleClassName,
  selectedButtonClassName,
  statusText,
  restoreBannerMode,
  canResumeServerTask,
  canReconnectInterruptedTask,
  taskPaused,
  onResumeOrReconnect,
  onRestart,
  onClear,
}: UploadTaskStatusCardProps) {
  if (!show) return null;

  return (
    <div className={cn("space-y-2 rounded-2xl border px-4 py-3", surfaceClassName)}>
      <div className="space-y-1">
        <p className="text-sm font-medium">任务状态</p>
        <p className={cn("text-sm", textClassName)}>{statusText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {((restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && canResumeServerTask) ||
        canReconnectInterruptedTask ? (
          <Button type="button" className={cn("h-9 px-3", recoverableButtonClassName)} onClick={onResumeOrReconnect}>
            <RefreshCcw className="size-4" />
            {canReconnectInterruptedTask ? "继续查询" : "继续生成"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={(restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && taskPaused ? "outline" : "default"}
          className={cn(
            "h-9 px-3",
            (restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && taskPaused
              ? selectedButtonSubtleClassName
              : selectedButtonClassName,
          )}
          onClick={onRestart}
        >
          <RefreshCcw className="size-4" />
          重新开始
        </Button>
        <Button type="button" variant="ghost" className="h-9 px-3" onClick={onClear}>
          清空这次记录
        </Button>
      </div>
    </div>
  );
}
