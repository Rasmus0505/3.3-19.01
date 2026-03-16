import { Activity, Wallet } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

const PANELS = [
  { value: "activity", label: "活跃用户", description: "按登录活跃看趋势、列表和单用户摘要。", icon: Activity },
  { value: "wallet", label: "余额流水", description: "沿着用户邮箱继续追充值、扣点和调账。", icon: Wallet },
];

function getPanel(value) {
  return PANELS.find((item) => item.value === value) || PANELS[0];
}

export function AdminUsersPage({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPanel = readStringParam(searchParams, "panel", "activity");
  const activePanel = getPanel(requestedPanel).value;

  useEffect(() => {
    if (requestedPanel === activePanel) return;
    setSearchParams(mergeSearchParams(searchParams, { panel: activePanel }), { replace: true });
  }, [activePanel, requestedPanel, searchParams, setSearchParams]);

  function switchPanel(nextPanel) {
    setSearchParams(mergeSearchParams(searchParams, { panel: nextPanel, page: null }), { replace: nextPanel === activePanel });
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">登录即活跃</Badge>
              <Badge variant="outline">用户操作保留</Badge>
            </div>
            <div>
              <CardTitle className="text-lg">用户活跃页把趋势、列表和后续排查放到同一条链路</CardTitle>
              <CardDescription>先看指定日期或区间内的登录活跃，再下钻到单个用户的摘要、调账、删除，必要时继续切到余额流水核对明细。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PANELS.map((item) => {
              const Icon = item.icon;
              const active = item.value === activePanel;
              return (
                <Button key={item.value} variant={active ? "default" : "outline"} size="sm" onClick={() => switchPanel(item.value)}>
                  <Icon className="size-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">{getPanel(activePanel).description}</p>
        </CardHeader>
      </Card>

      {activePanel === "activity" ? <AdminUsersTab apiCall={apiCall} /> : null}
      {activePanel === "wallet" ? <AdminLogsTab apiCall={apiCall} /> : null}
    </div>
  );
}
