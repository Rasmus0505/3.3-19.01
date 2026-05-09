// 桌面客户端更新横幅组件。

import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui";

export interface DesktopUpdateState {
  updateAvailable?: boolean;
  downloading?: boolean;
  downloadProgress?: number;
  installPending?: boolean;
  status?: string;
  remoteVersion?: string;
  releaseName?: string;
  message?: string;
  lastError?: string;
  badgeVisible?: boolean;
  localVersion?: string;
  currentVersion?: string;
}

interface UploadDesktopUpdateBannerProps {
  updateState: DesktopUpdateState | null;
  dismissed: boolean;
  onDismiss: () => void;
  onRestartAndInstall: () => void;
  onStartDownload: () => void;
  onOpenLink: () => void;
}

export function UploadDesktopUpdateBanner({
  updateState,
  dismissed,
  onDismiss,
  onRestartAndInstall,
  onStartDownload,
  onOpenLink,
}: UploadDesktopUpdateBannerProps) {
  if (!updateState?.updateAvailable || dismissed) return null;

  return (
    <>
      <div className="flex items-start justify-between rounded-lg border border-blue-200 bg-blue-50 p-3">
        {updateState?.downloading ? (
          <div className="w-full">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium text-blue-900">正在下载更新</span>
              <span className="text-sm text-blue-700">{updateState?.downloadProgress}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${updateState?.downloadProgress || 0}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{updateState?.message}</div>
          </div>
        ) : updateState?.installPending ? (
          <div className="w-full">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-900">下载完成</span>
            </div>
            <div className="mt-1 text-xs text-green-700">点击「重启并安装」完成更新，或选择「稍后」</div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onDismiss}>
                稍后
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={onRestartAndInstall}>
                重启并安装
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-red-500"></span>
                <span className="text-sm font-medium text-blue-900">
                  发现新版本 {updateState?.remoteVersion}
                </span>
              </div>
              <div className="mt-1 text-xs text-blue-700">
                {updateState?.releaseName ? `${updateState.releaseName} — ` : ""}
                点击"立即更新"下载并安装
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onDismiss}>
                稍后
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={onStartDownload}>
                立即更新
              </Button>
            </div>
          </>
        )}
      </div>

      {updateState?.status === "error" && (
        <div className="flex items-start justify-between rounded-lg border border-red-200 bg-red-50 p-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-900">更新失败</span>
            </div>
            <div className="mt-1 text-xs text-red-700">
              {updateState?.lastError === "network_error" && "网络连接失败，请检查网络后重试"}
              {updateState?.lastError === "server_error" && "服务器暂时不可用，请稍后重试"}
              {updateState?.lastError === "disk_error" && "磁盘空间不足，请清理后重试"}
              {(!updateState?.lastError || updateState?.lastError === "unknown") && "更新遇到问题，请重试或联系支持"}
            </div>
            {updateState?.message && updateState.message !== "下载失败，请重试" && (
              <div className="mt-1 text-xs text-muted-foreground">{updateState.message}</div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onStartDownload}>
              重试
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onOpenLink}>
              官网下载
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
