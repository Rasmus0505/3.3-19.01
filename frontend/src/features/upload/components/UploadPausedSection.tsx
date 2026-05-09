// 上传暂停状态组件。

import { RefreshCcw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../../shared/ui";

interface UploadPausedSectionProps {
  show: boolean;
  surfaceClassName: string;
  textClassName: string;
  recoverableButtonClassName: string;
  statusText: string;
  hasLocalFile: boolean;
  onSubmit: () => void;
  onClearTask: () => void;
  onResetSession: () => void;
}

export function UploadPausedSection({
  show,
  surfaceClassName,
  textClassName,
  recoverableButtonClassName,
  statusText,
  hasLocalFile,
  onSubmit,
  onClearTask,
  onResetSession,
}: UploadPausedSectionProps) {
  if (!show) return null;

  return (
    <div className={cn("space-y-2 rounded-2xl border px-4 py-3", surfaceClassName)}>
      <p className={cn("text-sm", textClassName)}>{statusText || "上传已暂停，可继续上传当前素材。"}</p>
      <div className="flex flex-wrap gap-2">
        {hasLocalFile ? (
          <Button type="button" className={recoverableButtonClassName} onClick={onSubmit}>
            <RefreshCcw className="size-4" />
            继续上传当前素材
          </Button>
        ) : null}
        {hasLocalFile ? (
          <Button type="button" variant="ghost" onClick={onClearTask}>
            保留素材并清空状态
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onResetSession}>
          更换素材
        </Button>
      </div>
    </div>
  );
}
