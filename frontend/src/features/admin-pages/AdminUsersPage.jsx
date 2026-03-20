import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { CardTitle } from "../../shared/ui";

export function AdminUsersPage({ apiCall }) {
  return (
    <div className="space-y-6">
      <section id="admin-users-activity" className="space-y-3">
        <CardTitle className="text-base">用户活跃</CardTitle>
        <AdminUsersTab apiCall={apiCall} />
      </section>

      <section id="admin-users-wallet-logs" className="space-y-3 border-t pt-6">
        <CardTitle className="text-base">余额流水</CardTitle>
        <AdminLogsTab apiCall={apiCall} queryPrefix="wallet" />
      </section>
    </div>
  );
}
