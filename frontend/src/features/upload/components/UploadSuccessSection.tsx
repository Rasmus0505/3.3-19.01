// 生成成功展示组件。

import { CheckCircle2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../../shared/ui";

interface UploadSuccessSectionProps {
  show: boolean;
  surfaceClassName: string;
  textClassName: string;
  buttonClassName: string;
  selectedButtonSubtleClassName: string;
  title: string;
  message: string;
  partialFailureStageLabel: string;
  partialFailureSummary: string;
  hasCopyButton: boolean;
  lessonId: string | number | null;
  onNavigateToLesson: (id: string | number) => void;
  onCopyDebugReport: () => void;
  onResetSession: () => void;
}

export function UploadSuccessSection({
  show,
  surfaceClassName,
  textClassName,
  buttonClassName,
  selectedButtonSubtleClassName,
  title,
  message,
  partialFailureStageLabel,
  partialFailureSummary,
  hasCopyButton,
  lessonId,
  onNavigateToLesson,
  onCopyDebugReport,
  onResetSession,
}: UploadSuccessSectionProps) {
  if (!show) return null;

  return (
    <div className={cn("space-y-3 rounded-2xl border p-4", surfaceClassName)}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className={cn("mt-0.5 size-5", textClassName)} />
        <div className="space-y-1">
          <p className={cn("text-sm font-semibold", textClassName)}>{title}</p>
          <p className={cn("text-sm", textClassName)}>{message}</p>
          {partialFailureStageLabel || partialFailureSummary ? (
            <div className="space-y-1">
              {partialFailureStageLabel ? (
                <p className="text-xs font-semibold">未完成阶段：{partialFailureStageLabel}</p>
              ) : null}
              {partialFailureSummary ? (
                <p className="text-xs opacity-85 break-words">{partialFailureSummary}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {lessonId ? (
          <Button type="button" className={cn("h-9 px-3", buttonClassName)} onClick={() => onNavigateToLesson(lessonId)}>
            去学习
          </Button>
        ) : null}
        {hasCopyButton ? (
          <Button type="button" variant="outline" className={cn("h-9 px-3", selectedButtonSubtleClassName)} onClick={onCopyDebugReport}>
            复制排错信息
          </Button>
        ) : null}
        <Button type="button" variant="outline" className={cn("h-9 px-3", selectedButtonSubtleClassName)} onClick={onResetSession}>
          继续上传
        </Button>
      </div>
    </div>
  );
}
