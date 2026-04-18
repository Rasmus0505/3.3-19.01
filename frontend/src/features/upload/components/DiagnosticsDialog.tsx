// 诊断信息弹窗组件。
import { RefreshCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '../../../shared/ui';

interface DiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnostics: DesktopDiagnostics | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenLogsDirectory: () => void;
  error: string | null;
  modelUpdateState: AsrModelUpdateState | null;
}

export interface AsrModelUpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  progress?: number;
  lastError?: string;
}

export interface DesktopDiagnostics {
  version?: string;
  modelVersions?: Record<string, string>;
  storageUsage?: { used: number; total: number };
  runtimeStatus?: string;
}

export function DiagnosticsDialog({
  open,
  onOpenChange,
  diagnostics,
  loading,
  onRefresh,
  onOpenLogsDirectory,
  error,
  modelUpdateState,
}: DiagnosticsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>桌面客户端诊断</DialogTitle>
          <DialogDescription>
            查看客户端运行状态和诊断信息
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 模型更新状态 */}
          {modelUpdateState && (
            <div className="rounded-lg border border-muted bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">
                模型更新状态
              </div>
              <div className="mt-1 text-sm">
                {modelUpdateState.status === 'checking' && '检查更新中...'}
                {modelUpdateState.status === 'downloading' && `下载中... ${modelUpdateState.progress || 0}%`}
                {modelUpdateState.status === 'ready' && '模型已是最新'}
                {modelUpdateState.status === 'error' && (
                  <span className="text-destructive">
                    更新遇到问题，请重试
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                {(modelUpdateState.status === 'ready' || modelUpdateState.status === 'error') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.desktopRuntime?.startModelUpdate?.()}
                  >
                    {modelUpdateState.status === 'error' ? '重试更新' : '更新模型'}
                  </Button>
                )}
                {modelUpdateState.status === 'downloading' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.desktopRuntime?.cancelModelUpdate?.()}
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 诊断信息卡片 */}
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="rounded-lg border bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
            {loading ? '正在刷新诊断信息...' : '诊断信息会在打开面板时自动刷新'}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCcw className={loading ? 'animate-spin' : ''} />
            刷新状态
          </Button>
          <Button variant="outline" onClick={() => window.desktopRuntime?.checkClientUpdate?.()}>
            检查更新
          </Button>
          <Button onClick={onOpenLogsDirectory}>
            打开日志目录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


