import { useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AdminHealthPage } from "./features/admin-pages/AdminHealthPage";
import { AdminModelsPage } from "./features/admin-pages/AdminModelsPage";
import { AdminRedeemPage } from "./features/admin-pages/AdminRedeemPage";
import { AdminSecurityPage } from "./features/admin-pages/AdminSecurityPage";
import { AdminUsersPage } from "./features/admin-pages/AdminUsersPage";
import { useErrorCopyShortcut } from "./shared/hooks/useErrorCopyShortcut";
import { resolveAdminNavItem } from "./shared/lib/adminSearchParams";
import { Badge } from "./shared/ui";

export function AdminApp({ apiCall }) {
  const location = useLocation();
  const activeItem = useMemo(() => resolveAdminNavItem(location.pathname), [location.pathname]);

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
        <Route index element={<Navigate to="health" replace />} />
        <Route path="health" element={<AdminHealthPage apiCall={apiCall} />} />
        <Route path="security" element={<AdminSecurityPage apiCall={apiCall} />} />
        <Route path="users" element={<AdminUsersPage apiCall={apiCall} />} />
        <Route path="models" element={<AdminModelsPage apiCall={apiCall} />} />
        <Route path="redeem" element={<AdminRedeemPage apiCall={apiCall} />} />

        <Route path="logs" element={<Navigate to="/admin/users#admin-users-wallet-logs" replace />} />
        <Route path="rates" element={<Navigate to="/admin/models?tab=billing" replace />} />
        <Route path="subtitle-settings" element={<Navigate to="/admin/models?tab=billing" replace />} />
        <Route path="redeem-batches" element={<Navigate to="/admin/redeem#admin-redeem-batches" replace />} />
        <Route path="redeem-codes" element={<Navigate to="/admin/redeem#admin-redeem-codes" replace />} />
        <Route path="redeem-audit" element={<Navigate to="/admin/redeem#admin-redeem-audit" replace />} />

        <Route path="*" element={<Navigate to="health" replace />} />
      </Routes>
    </div>
  );
}
