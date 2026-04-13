import { useState, useEffect, useCallback } from "react";

export function useDashboardData(apiCall) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiCall("/api/dashboard/stats", {});
      if (resp.ok) {
        const data = await resp.json();
        setStats(data);
      } else {
        setError("Failed to load dashboard data");
      }
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
