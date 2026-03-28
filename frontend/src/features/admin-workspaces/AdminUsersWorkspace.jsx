import { Coins, Settings2, Users } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

export const USERS_TABS = [
  { value: "list", label: "用户列表", description: "搜索用户、调账、查看最近行为。", component: AdminUsersTab },
  { value: "wallet", label: "余额流水", description: "按用户追踪元金额变动、退款、手工调账和兑换入账。", component: AdminLogsTab },
  { value: "rates", label: "计费价格", description: "统一维护 ASR 与翻译价格，不在这里调整运行时参数。", component: AdminRatesTab },
];

export function AdminUsersWorkspace({ apiCall, showTabsNavigation = true }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = readStringParam(searchParams, "tab");
  const activeTab = USERS_TABS.some((item) => item.value === requestedTab) ? requestedTab : "list";

  useEffect(() => {
    if (requestedTab === activeTab) return;
    setSearchParams(mergeSearchParams(searchParams, { tab: activeTab, page: null }), { replace: true });
  }, [activeTab, requestedTab, searchParams, setSearchParams]);

  if (requestedTab !== activeTab) return null;

  function handleTabChange(nextTab) {
    setSearchParams(mergeSearchParams(searchParams, { tab: nextTab, page: null }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">用户运营工作台</CardTitle>
                <Badge variant="outline">用户 + 钱包 + 计费</Badge>
              </div>
              <CardDescription>默认从用户开始，再沿着钱包、计费价格或兑换审计向下排查；价格编辑留在这里，运行诊断统一留在排障中心。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/users?tab=list">
                  <Users className="size-4" />
                  查用户
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/users?tab=wallet">
                  <Coins className="size-4" />
                  看元金额流水
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/users?tab=rates">
                  <Settings2 className="size-4" />
                  改计费价格
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/redeem?panel=audit">
                  <Coins className="size-4" />
                  查看兑换审计
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">用户维度优先</CardTitle>
              <CardDescription>先确认用户，再沿着钱包流水和兑换记录继续追踪。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">深链跳转</CardTitle>
              <CardDescription>用户摘要里的跳转会直接切到对应标签页，并自动带上邮箱筛选。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">计费只看价格</CardTitle>
              <CardDescription>计费标签页只面向售价、成本和启停状态，不再混入运行时调优或系统诊断动作。</CardDescription>
            </CardHeader>
          </Card>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {showTabsNavigation ? (
          <TabsList className="h-auto flex-wrap justify-start">
            {USERS_TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}
        {USERS_TABS.map((item) => {
          const Component = item.component;
          return (
            <TabsContent key={item.value} value={item.value} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-medium">{item.label}</h2>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Component apiCall={apiCall} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
