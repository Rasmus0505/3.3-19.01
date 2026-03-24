import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui";
import { SYNC_STATUS } from "../../hooks/useOfflineMode";

export function ConnectionStatusBadge({
  isOnline,
  isSyncing,
  syncStatus,
  lastSyncDisplay,
  syncedItems,
  className = "",
}) {
  const getStatusConfig = () => {
    if (syncStatus === SYNC_STATUS.SYNCING || isSyncing) {
      return {
        icon: RefreshCw,
        iconClass: "animate-spin text-primary",
        bgClass: "bg-blue-100 dark:bg-blue-900/30",
        dotClass: "bg-blue-500",
        label: "同步中...",
        tooltipText: "正在同步数据到云端",
        variant: "syncing",
      };
    }

    if (!isOnline || syncStatus === SYNC_STATUS.OFFLINE) {
      return {
        icon: WifiOff,
        iconClass: "text-muted-foreground",
        bgClass: "bg-muted/50",
        dotClass: "bg-muted-foreground",
        label: "离线模式",
        tooltipText: lastSyncDisplay
          ? `网络已断开，上次同步：${lastSyncDisplay}。本地功能可用，云端功能暂不可用。`
          : "网络已断开，进入离线模式。本地功能可用，云端功能暂不可用。",
        variant: "offline",
      };
    }

    if (syncStatus === SYNC_STATUS.ERROR) {
      return {
        icon: WifiOff,
        iconClass: "text-destructive",
        bgClass: "bg-destructive/10",
        dotClass: "bg-destructive",
        label: "同步失败",
        tooltipText: "同步失败，请检查网络后重试",
        variant: "error",
      };
    }

    if (syncStatus === SYNC_STATUS.SYNCED || isOnline) {
      return {
        icon: Wifi,
        iconClass: "text-green-500",
        bgClass: "bg-green-100 dark:bg-green-900/30",
        dotClass: "bg-green-500",
        label: syncedItems > 0 ? `已同步 (${syncedItems})` : "在线",
        tooltipText: lastSyncDisplay
          ? `已连接云端，上次同步：${lastSyncDisplay}`
          : "已连接云端，服务正常",
        variant: "online",
      };
    }

    return {
      icon: Wifi,
      iconClass: "text-muted-foreground",
      bgClass: "bg-muted/50",
      dotClass: "bg-muted-foreground",
      label: "空闲",
      tooltipText: "正在检查连接状态...",
      variant: "idle",
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${config.bgClass} ${className}`}
        >
          <Icon className={`size-3.5 ${config.iconClass}`} />
          <span className={`text-xs font-medium ${config.variant === "offline" || config.variant === "error" ? "text-muted-foreground" : ""}`}>
            {config.label}
          </span>
          <span className={`size-1.5 rounded-full ${config.dotClass}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-sm">{config.tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
