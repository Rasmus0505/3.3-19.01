import { useEffect, useRef, useState } from "react";

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

export function useDesktopSync({ accessToken, isDesktop = false }) {
  const engineRef = useRef(null);
  const [syncState, setSyncState] = useState({
    status: "idle",
    syncingTables: [],
    totalItems: 0,
    completedItems: 0,
    lastSyncAt: null,
    error: null,
  });
  const [conflicts, setConflicts] = useState([]);
  const [pendingCounts, setPendingCounts] = useState({ courses: 0, progress: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastSyncDisplay, setLastSyncDisplay] = useState(null);

  useEffect(() => {
    if (!isDesktop || typeof window === "undefined" || !window.syncEngine) {
      setIsInitialized(false);
      return;
    }

    let cleanup = null;
    let syncOnOnline = null;

    async function initSync() {
      try {
        engineRef.current = window.syncEngine;
        const status = await engineRef.current.getStatus();
        setSyncState(status);
        setLastSyncDisplay(formatLastSyncTime(status.lastSyncAt));

        const pending = await engineRef.current.getPendingCounts();
        setPendingCounts(pending);

        cleanup = engineRef.current.on("syncStateChanged", (event, data) => {
          setSyncState(data);
          setLastSyncDisplay(formatLastSyncTime(data.lastSyncAt));
        });

        const unresolved = await engineRef.current.getConflicts();
        setConflicts(unresolved);

        engineRef.current.on("conflict", () => {
          engineRef.current.getConflicts().then(setConflicts);
        });

        engineRef.current.on("conflictResolved", () => {
          engineRef.current.getConflicts().then(setConflicts);
        });

        syncOnOnline = () => {
          engineRef.current.autoSync().catch(() => {});
        };
        window.addEventListener("online", syncOnOnline);

        if (navigator.onLine) {
          await engineRef.current.autoSync();
        }
      } catch (_) {
      } finally {
        setIsInitialized(true);
      }
    }

    void initSync();

    return () => {
      if (cleanup) cleanup();
      if (syncOnOnline) window.removeEventListener("online", syncOnOnline);
    };
  }, [isDesktop]);

  async function resolveConflict(conflictId, strategy) {
    if (!engineRef.current) return;
    try {
      await engineRef.current.resolveConflict(conflictId, strategy);
      const pending = await engineRef.current.getPendingCounts();
      setPendingCounts(pending);
      const unresolved = await engineRef.current.getConflicts();
      setConflicts(unresolved);
    } catch (_) {}
  }

  async function forceSync() {
    if (!engineRef.current) return;
    await engineRef.current.autoSync();
  }

  return {
    syncState,
    syncStatus: syncState.status,
    syncingTables: syncState.syncingTables,
    totalItems: syncState.totalItems,
    completedItems: syncState.completedItems,
    lastSyncAt: syncState.lastSyncAt,
    lastSyncDisplay,
    error: syncState.error,
    conflicts,
    pendingCounts,
    isInitialized,
    isDesktop,
    resolveConflict,
    forceSync,
    formatLastSyncTime,
  };
}
