// 任务进度展示组件（进度条 + 阶段卡片 + 时间线）。

import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import ActivityTimeline from "./ActivityTimeline";

interface StageItem {
  key: string;
  label: string;
  status: string;
  progressPercent: number;
  detailText?: string;
  statusText?: string;
}

interface UploadProgressSectionProps {
  show: boolean;
  surfaceClassName: string;
  textClassName: string;
  progressClassName: string;
  headline: string;
  percent: number;
  stageItems: StageItem[];
  events: unknown[];
  linkImporting: boolean;
  getStageTone: (status: string) => string;
  getToneStyles: (tone: string) => Record<string, string>;
}

export function UploadProgressSection({
  show,
  surfaceClassName,
  textClassName,
  progressClassName,
  headline,
  percent,
  stageItems,
  events,
  linkImporting,
  getStageTone,
  getToneStyles,
}: UploadProgressSectionProps) {
  if (!show) return null;

  return (
    <div className={cn("space-y-2 rounded-2xl border px-4 py-3", surfaceClassName)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{headline}</p>
          <p className={cn("text-xs", textClassName)}>总进度</p>
        </div>
        <span className={cn("text-sm font-semibold tabular-nums", textClassName)}>{percent}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width,background-color] duration-300", progressClassName)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="grid grid-cols-7 gap-2 overflow-x-auto pb-1">
        {stageItems.map((item, index) => {
          const stageToneStyles = getToneStyles(getStageTone(item.status));
          const stageLabel = linkImporting && item.key === "convert_audio" ? "下载素材" : item.label;
          const isCompleted = item.status === "completed";
          const isRunning = item.status === "running";
          const isFailed = item.status === "failed";
          return (
            <div key={item.key} className={cn("min-w-[104px] space-y-1.5 rounded-lg border px-2 py-2", stageToneStyles.surface)}>
              <div className="flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums">
                  {isCompleted ? <CheckCircle2 className="size-3.5" /> : isRunning ? <Loader2 className="size-3.5 animate-spin" /> : isFailed ? "!" : index + 1}
                </span>
                <p className="min-w-0 truncate text-xs font-semibold leading-4">{stageLabel}</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                <div
                  className={cn("h-full rounded-full transition-[width,background-color] duration-300", stageToneStyles.progress)}
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
              <p className="truncate text-[11px] leading-4 opacity-85">{item.detailText || item.statusText}</p>
            </div>
          );
        })}
      </div>

      <ActivityTimeline events={events} />
    </div>
  );
}
