/**@jsxImportSource react*/
"""桌面客户端引导弹窗组件。"""
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Button } from '../../../shared/ui';

interface DesktopGuidanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  leadText: string;
  detail: string;
  isLargeFile?: boolean;
  distributionNote?: string;
  onOpenDesktopDownload?: () => void;
  onOpenSnapAny?: () => void;
}

export function DesktopGuidanceDialog({
  open,
  onOpenChange,
  title,
  leadText,
  detail,
  isLargeFile,
  distributionNote,
  onOpenDesktopDownload,
  onOpenSnapAny,
}: DesktopGuidanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <p>{leadText}</p>
              <p>{detail}</p>

              {isLargeFile && (
                <>
                  <p>
                    Bottle 2.0 当前仍支持音频与视频文件直传；当素材特别大或网络不稳定时，
                    优先改用桌面端会更可靠。
                  </p>
                  <p>
                    当前建议阈值不是硬性限制：在 2 GB / 12 小时以内仍可继续使用当前流程，
                    但更推荐桌面端处理高风险素材。
                  </p>
                </>
              )}

              {distributionNote && (
                <p className="text-xs text-muted-foreground">{distributionNote}</p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          {onOpenDesktopDownload && (
            <Button onClick={onOpenDesktopDownload} className="flex-1">
              下载桌面客户端
            </Button>
          )}
          {onOpenSnapAny && (
            <Button variant="outline" onClick={onOpenSnapAny} className="flex-1">
              使用 SnapAny 下载
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
