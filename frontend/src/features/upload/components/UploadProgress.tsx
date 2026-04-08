// 上传进度显示组件。
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Progress } from '../../../shared/ui';

interface UploadProgressProps {
  progress: number;
  stage: string;
  isUploading: boolean;
  error: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  idle: '等待上传',
  preparing: '准备中',
  uploading: '上传中',
  processing: '处理中',
  transcribing: '语音识别中',
  translating: '翻译中',
  generating: '生成中',
  completed: '完成',
  error: '出错',
};

export function UploadProgress({ progress, stage, isUploading, error }: UploadProgressProps) {
  const stageLabel = STAGE_LABELS[stage] || stage;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-4" />
          <span className="text-sm font-medium">上传失败</span>
        </div>
        <p className="mt-2 text-sm text-destructive/80">{error}</p>
      </div>
    );
  }

  if (!isUploading && progress === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {stage === 'completed' ? (
            <CheckCircle2 className="size-4 text-green-500" />
          ) : (
            <Loader2 className="size-4 animate-spin text-primary" />
          )}
          <span className="text-sm font-medium">{stageLabel}</span>
        </div>
        <span className="text-sm text-muted-foreground">{progress}%</span>
      </div>

      <Progress value={progress} className="h-2" />

      {isUploading && (
        <p className="text-xs text-muted-foreground">
          请勿关闭页面，文件正在上传和处理中...
        </p>
      )}
    </div>
  );
}
