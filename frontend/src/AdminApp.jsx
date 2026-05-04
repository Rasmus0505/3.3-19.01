import { lazy, useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useErrorCopyShortcut } from "./shared/hooks/useErrorCopyShortcut";
import { resolveAdminNavItem } from "./shared/lib/adminSearchParams";
import { Badge } from "./shared/ui";

const AdminAnnouncementsPage = lazy(() =>
  import("./features/admin-pages/AdminAnnouncementsPage").then((m) => ({ default: m.AdminAnnouncementsPage })),
);
const AdminRedeemPage = lazy(() =>
  import("./features/admin-pages/AdminRedeemPage").then((m) => ({ default: m.AdminRedeemPage })),
);
const AdminSecurityPage = lazy(() =>
  import("./features/admin-pages/AdminSecurityPage").then((m) => ({ default: m.AdminSecurityPage })),
);
const AdminUsersPage = lazy(() =>
  import("./features/admin-pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminMonitoringWorkspace = lazy(() =>
  import("./features/admin-workspaces/AdminMonitoringWorkspace").then((m) => ({ default: m.AdminMonitoringWorkspace })),
);

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
        {activeItem.description ? <p className="text-sm text-muted-foreground">{activeItem.description}</p> : null}
      </section>

      <Routes>
        <Route index element={<Navigate to="users?tab=list" replace />} />
        <Route path="health" element={<Navigate to="/admin/troubleshooting?tab=health&panel=overview" replace />} />
        <Route path="troubleshooting" element={<AdminMonitoringWorkspace apiCall={apiCall} />} />
        <Route path="security" element={<AdminSecurityPage apiCall={apiCall} />} />
        <Route path="users" element={<AdminUsersPage apiCall={apiCall} />} />
        <Route path="redeem" element={<AdminRedeemPage apiCall={apiCall} />} />
        <Route path="announcements" element={<AdminAnnouncementsPage apiCall={apiCall} />} />

        <Route path="logs" element={<Navigate to="/admin/users?tab=wallet" replace />} />
        <Route path="rates" element={<Navigate to="/admin/users?tab=rates" replace />} />
        <Route path="subtitle-settings" element={<Navigate to="/admin/users?tab=rates" replace />} />
        <Route path="redeem-batches" element={<Navigate to="/admin/redeem?panel=batches" replace />} />
        <Route path="redeem-codes" element={<Navigate to="/admin/redeem?panel=codes" replace />} />
        <Route path="redeem-audit" element={<Navigate to="/admin/redeem?panel=audit" replace />} />

        <Route path="*" element={<Navigate to="users?tab=list" replace />} />
      </Routes>
    </div>
  );
}


