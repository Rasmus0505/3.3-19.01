import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { CardDescription, CardTitle } from "../../shared/ui";

export function AdminUsersPage({ apiCall }) {
  return (
    <div className="space-y-6">
      <section id="admin-users-activity" className="space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">用户活跃</CardTitle>
          <CardDescription>先看登录趋势和用户列表，再下钻到单个用户摘要、调账和删除。</CardDescription>
        </div>
        <AdminUsersTab apiCall={apiCall} />
      </section>

      <section id="admin-users-wallet-logs" className="space-y-3 border-t pt-6">
        <div className="space-y-1">
          <CardTitle className="text-base">余额流水</CardTitle>
          <CardDescription>同页继续看充值、扣费和手工调账的流水明细，不再单独切页。</CardDescription>
        </div>
        <AdminLogsTab apiCall={apiCall} queryPrefix="wallet" />
      </section>
    </div>
  );
}
