import { Coins, Settings2, Users } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

const USERS_TABS = [
  { value: "list", label: "用户列表", description: "搜索用户、调账、查看最近行为。", component: AdminUsersTab },
  { value: "wallet", label: "余额流水", description: "按用户追扣点、退款、手工调账和兑换入账。", component: AdminLogsTab },
  { value: "rates", label: "计费配置", description: "统一维护 ASR 与翻译计费参数。", component: AdminRatesTab },
];

export function AdminUsersWorkspace({ apiCall }) {
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
                <CardTitle className="text-lg">用户计费工作台</CardTitle>
                <Badge variant="outline">用户 + 钱包 + 计费</Badge>
              </div>
              <CardDescription>把用户管理、钱包流水和模型计费放在同一工作台，减少“先找用户再找流水”的重复跳转。</CardDescription>
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
                  看余额流水
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/users?tab=rates">
                  <Settings2 className="size-4" />
                  改计费配置
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
              <CardTitle className="text-base">不改接口</CardTitle>
              <CardDescription>仅整合前端路由和工作台，不改用户、钱包和计费后端接口。</CardDescription>
            </CardHeader>
          </Card>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          {USERS_TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
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
