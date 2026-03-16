import { useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AdminHealthPage } from "./features/admin-pages/AdminHealthPage";
import { AdminModelsPage } from "./features/admin-pages/AdminModelsPage";
import { AdminRedeemPage } from "./features/admin-pages/AdminRedeemPage";
import { AdminUsersPage } from "./features/admin-pages/AdminUsersPage";
import { useErrorCopyShortcut } from "./shared/hooks/useErrorCopyShortcut";
import { resolveAdminNavItem } from "./shared/lib/adminSearchParams";
import { Badge } from "./shared/ui";

function applyLegacyPanel(searchParams, panel) {
  if (panel) searchParams.set("panel", panel);
  else searchParams.delete("panel");
  searchParams.delete("tab");
  return searchParams;
}

function resolveLegacyMonitoringDestination(requestedTab, requestedPanel) {
  const panel = String(requestedPanel || "").trim().toLowerCase();
  const tab = String(requestedTab || "").trim().toLowerCase();
  const key = panel || tab;

  if (["subtitle-policy", "rates"].includes(key)) {
    return { path: "/admin/models", panel: "strategy" };
  }
  if (["task-failures", "tasks"].includes(key)) {
    return { path: "/admin/health", panel: "tasks" };
  }
  if (key === "translations") {
    return { path: "/admin/health", panel: "translations" };
  }
  if (key === "operations") {
    return { path: "/admin/health", panel: "operations" };
  }
  return { path: "/admin/health", panel: "diagnosis" };
}

function resolveLegacyBusinessDestination(requestedTab, requestedPanel) {
  const panel = String(requestedPanel || "").trim().toLowerCase();
  const tab = String(requestedTab || "").trim().toLowerCase();
  const key = panel || tab;

  if (key === "wallet") {
    return { path: "/admin/users", panel: "wallet" };
  }
  if (key === "rates") {
    return { path: "/admin/models", panel: "rates" };
  }
  if (["codes", "audit", "batches", "redeem"].includes(key)) {
    return { path: "/admin/redeem", panel: key === "redeem" ? "batches" : key };
  }
  return { path: "/admin/users", panel: "activity" };
}

function LegacyAdminRedirect({ resolveDestination }) {
  const location = useLocation();
  const nextSearchParams = new URLSearchParams(location.search);
  const requestedTab = nextSearchParams.get("tab");
  const requestedPanel = nextSearchParams.get("panel");
  const destination = resolveDestination(requestedTab, requestedPanel, location.pathname);
  const nextSearch = applyLegacyPanel(nextSearchParams, destination.panel).toString();
  return <Navigate to={`${destination.path}${nextSearch ? `?${nextSearch}` : ""}`} replace />;
}

export function AdminApp({ apiCall }) {
  const location = useLocation();
  const activeItem = useMemo(() => resolveAdminNavItem(location.pathname, location.search), [location.pathname, location.search]);

  useErrorCopyShortcut();

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">管理台</p>
          <Badge variant="outline">Ctrl+Shift+C 复制最近错误</Badge>
        </div>
        <h2 className="text-xl font-semibold">{activeItem.label}</h2>
        <p className="text-sm text-muted-foreground">{activeItem.description}</p>
      </section>

      <Routes>
        <Route index element={<Navigate to="health" replace />} />
        <Route path="health" element={<AdminHealthPage apiCall={apiCall} />} />
        <Route path="users" element={<AdminUsersPage apiCall={apiCall} />} />
        <Route path="models" element={<AdminModelsPage apiCall={apiCall} />} />
        <Route path="redeem" element={<AdminRedeemPage apiCall={apiCall} />} />

        <Route path="monitoring" element={<LegacyAdminRedirect resolveDestination={resolveLegacyMonitoringDestination} />} />
        <Route path="ops" element={<LegacyAdminRedirect resolveDestination={resolveLegacyMonitoringDestination} />} />
        <Route path="pipeline" element={<LegacyAdminRedirect resolveDestination={resolveLegacyMonitoringDestination} />} />
        <Route path="business" element={<LegacyAdminRedirect resolveDestination={resolveLegacyBusinessDestination} />} />

        <Route path="overview" element={<Navigate to="/admin/health?panel=diagnosis" replace />} />
        <Route path="system" element={<Navigate to="/admin/health?panel=diagnosis" replace />} />
        <Route path="operation-logs" element={<Navigate to="/admin/health?panel=operations" replace />} />
        <Route path="sql-console" element={<Navigate to="/admin/health?panel=diagnosis" replace />} />
        <Route path="lesson-task-logs" element={<Navigate to="/admin/health?panel=tasks" replace />} />
        <Route path="translation-logs" element={<Navigate to="/admin/health?panel=translations" replace />} />
        <Route path="subtitle-settings" element={<Navigate to="/admin/models?panel=strategy" replace />} />
        <Route path="logs" element={<Navigate to="/admin/users?panel=wallet" replace />} />
        <Route path="rates" element={<Navigate to="/admin/models?panel=rates" replace />} />
        <Route path="redeem-batches" element={<Navigate to="/admin/redeem?panel=batches" replace />} />
        <Route path="redeem-codes" element={<Navigate to="/admin/redeem?panel=codes" replace />} />
        <Route path="redeem-audit" element={<Navigate to="/admin/redeem?panel=audit" replace />} />
        <Route path="*" element={<Navigate to="health" replace />} />
      </Routes>
    </div>
  );
}
