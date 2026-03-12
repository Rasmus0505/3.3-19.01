import { useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AdminBusinessWorkspace } from "./features/admin-workspaces/AdminBusinessWorkspace";
import { AdminMonitoringWorkspace } from "./features/admin-workspaces/AdminMonitoringWorkspace";
import { useErrorCopyShortcut } from "./shared/hooks/useErrorCopyShortcut";
import { Badge } from "./shared/ui";
import { resolveAdminNavItem } from "./shared/lib/adminSearchParams";

const MONITORING_TAB_MAP = {
  health: "health",
  overview: "health",
  system: "health",
  tasks: "tasks",
  "task-failures": "tasks",
  translations: "tasks",
  operations: "operations",
  "sql-console": "operations",
  "subtitle-policy": "operations",
};

const MONITORING_PANEL_MAP = {
  health: "overview",
  overview: "overview",
  system: "system",
  tasks: "task-failures",
  "task-failures": "task-failures",
  translations: "translations",
  operations: "operations",
  "sql-console": "sql-console",
  "subtitle-policy": "subtitle-policy",
};

const BUSINESS_TAB_MAP = {
  users: "users",
  list: "users",
  wallet: "users",
  rates: "users",
  redeem: "redeem",
  batches: "redeem",
  codes: "redeem",
  audit: "redeem",
};

const BUSINESS_PANEL_MAP = {
  users: "list",
  list: "list",
  wallet: "wallet",
  rates: "rates",
  redeem: "batches",
  batches: "batches",
  codes: "codes",
  audit: "audit",
};

function LegacyAdminRedirect({ to, fallbackTab, fallbackPanel, tabMap = {}, panelMap = {} }) {
  const location = useLocation();
  const nextSearchParams = new URLSearchParams(location.search);
  const requestedTab = nextSearchParams.get("tab") || "";
  const mappedTab = tabMap[requestedTab] || fallbackTab;
  const mappedPanel = panelMap[nextSearchParams.get("panel") || ""] || panelMap[requestedTab] || fallbackPanel;
  nextSearchParams.set("tab", mappedTab);
  if (mappedPanel) nextSearchParams.set("panel", mappedPanel);
  else nextSearchParams.delete("panel");
  const nextSearch = nextSearchParams.toString();
  return <Navigate to={`${to}${nextSearch ? `?${nextSearch}` : ""}`} replace />;
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
        <Route index element={<Navigate to="monitoring?tab=health&panel=overview" replace />} />
        <Route path="monitoring" element={<AdminMonitoringWorkspace apiCall={apiCall} />} />
        <Route path="business" element={<AdminBusinessWorkspace apiCall={apiCall} />} />

        <Route
          path="ops"
          element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="health" fallbackPanel="overview" tabMap={MONITORING_TAB_MAP} panelMap={MONITORING_PANEL_MAP} />}
        />
        <Route
          path="pipeline"
          element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="tasks" fallbackPanel="task-failures" tabMap={MONITORING_TAB_MAP} panelMap={MONITORING_PANEL_MAP} />}
        />
        <Route
          path="users"
          element={<LegacyAdminRedirect to="/admin/business" fallbackTab="users" fallbackPanel="list" tabMap={BUSINESS_TAB_MAP} panelMap={BUSINESS_PANEL_MAP} />}
        />
        <Route
          path="redeem"
          element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="batches" tabMap={BUSINESS_TAB_MAP} panelMap={BUSINESS_PANEL_MAP} />}
        />

        <Route path="overview" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="health" fallbackPanel="overview" />} />
        <Route path="system" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="health" fallbackPanel="system" />} />
        <Route path="operation-logs" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="operations" fallbackPanel="operations" />} />
        <Route path="sql-console" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="operations" fallbackPanel="sql-console" />} />
        <Route path="lesson-task-logs" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="tasks" fallbackPanel="task-failures" />} />
        <Route path="translation-logs" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="tasks" fallbackPanel="translations" />} />
        <Route path="subtitle-settings" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="operations" fallbackPanel="subtitle-policy" />} />
        <Route path="logs" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="users" fallbackPanel="wallet" />} />
        <Route path="rates" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="users" fallbackPanel="rates" />} />
        <Route path="redeem-batches" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="batches" />} />
        <Route path="redeem-codes" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="codes" />} />
        <Route path="redeem-audit" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="audit" />} />
        <Route path="*" element={<Navigate to="monitoring?tab=health&panel=overview" replace />} />
      </Routes>
    </div>
  );
}
