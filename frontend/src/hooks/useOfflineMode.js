import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const CLOUD_HEALTH_CHECK_INTERVAL_MS = 30000;
const CLOUD_HEALTH_CHECK_TIMEOUT_MS = 8000;

async function checkCloudHealth() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUD_HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch("/health", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (_) {
    clearTimeout(timeoutId);
    return false;
  }
}

function formatLastSyncTime(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)} 小时前`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return null;
  }
}

export const SYNC_STATUS = {
  IDLE: "idle",
  SYNCING: "syncing",
  SYNCED: "synced",
  OFFLINE: "offline",
  ERROR: "error",
};

export function useOfflineMode({ onSyncStart, onSyncComplete } = {}) {
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [cloudHealthy, setCloudHealthy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.IDLE);
  const [syncedItems, setSyncedItems] = useState(0);

  const healthCheckTimerRef = useRef(null);
  const isSyncingRef = useRef(false);

  const isOnline = browserOnline && cloudHealthy;
  const lastSyncDisplay = formatLastSyncTime(lastSyncAt);

  const checkHealth = useCallback(async () => {
    if (isSyncingRef.current) return;

    const healthy = await checkCloudHealth();
    setCloudHealthy(healthy);

    if (!healthy && browserOnline) {
      setSyncStatus(SYNC_STATUS.OFFLINE);
    } else if (healthy && !browserOnline) {
      setSyncStatus(SYNC_STATUS.OFFLINE);
    } else if (healthy) {
      setSyncStatus(isSyncingRef.current ? SYNC_STATUS.SYNCING : SYNC_STATUS.SYNCED);
    }
  }, [browserOnline]);

  const handleOnline = useCallback(() => {
    setBrowserOnline(true);
    toast.success("已恢复网络连接，正在检查云端服务...", { id: "offline-mode" });

    void checkHealth().then((healthy) => {
      if (healthy) {
        toast.success("云端服务正常，开始同步...", { id: "offline-mode" });
        if (onSyncStart) {
          setIsSyncing(true);
          setSyncStatus(SYNC_STATUS.SYNCING);
          onSyncStart();
        }
      } else {
        toast.warning("云端服务暂不可用，将在恢复后自动同步", { id: "offline-mode", duration: 5000 });
      }
    });
  }, [checkHealth, onSyncStart]);

  const handleOffline = useCallback(() => {
    setBrowserOnline(false);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    setCloudHealthy(false);
    toast.error("网络已断开，进入离线模式", { id: "offline-mode" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    checkHealth();

    healthCheckTimerRef.current = setInterval(checkHealth, CLOUD_HEALTH_CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (healthCheckTimerRef.current) {
        clearInterval(healthCheckTimerRef.current);
      }
    };
  }, [handleOnline, handleOffline, checkHealth]);

  const notifySyncComplete = useCallback((itemsCount = 0) => {
    setIsSyncing(false);
    setLastSyncAt(new Date().toISOString());
    setSyncStatus(SYNC_STATUS.SYNCED);
    setSyncedItems(itemsCount);

    if (itemsCount > 0) {
      toast.success(`同步完成，共同步 ${itemsCount} 条`, { id: "offline-mode" });
    } else {
      toast.success("已恢复连接，同步完成", { id: "offline-mode" });
    }

    if (onSyncComplete) {
      onSyncComplete(itemsCount);
    }
  }, [onSyncComplete]);

  const notifySyncStart = useCallback(() => {
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncStatus(SYNC_STATUS.SYNCING);
  }, []);

  return {
    isOnline,
    isSyncing,
    lastSyncAt,
    lastSyncDisplay,
    syncStatus,
    syncedItems,
    browserOnline,
    cloudHealthy,
    notifySyncComplete,
    notifySyncStart,
    checkHealth,
  };
}
