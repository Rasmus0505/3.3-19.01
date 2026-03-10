import { Gift, ScrollText, Ticket } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminRedeemAuditTab } from "../admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "../admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "../admin-redeem/AdminRedeemCodesTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

export const REDEEM_TABS = [
  { value: "batches", label: "兑换批次", description: "创建活动批次并判断当前批次是否健康。", component: AdminRedeemBatchesTab },
  { value: "codes", label: "兑换码列表", description: "按批次或用户追具体兑换码状态。", component: AdminRedeemCodesTab },
  { value: "audit", label: "兑换审计", description: "查看成功/失败兑换记录并安全导出。", component: AdminRedeemAuditTab },
];

export function AdminRedeemWorkspace({ apiCall, showTabsNavigation = true }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = readStringParam(searchParams, "tab");
  const activeTab = REDEEM_TABS.some((item) => item.value === requestedTab) ? requestedTab : "batches";

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
                <CardTitle className="text-lg">活动兑换工作台</CardTitle>
                <Badge variant="outline">活动配置 + 审计</Badge>
              </div>
              <CardDescription>把批次、兑换码和审计收在一起，运营处理活动时不再需要记 3 个顶层入口。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/redeem?tab=batches">
                  <Gift className="size-4" />
                  看批次
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/redeem?tab=codes">
                  <Ticket className="size-4" />
                  看兑换码
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/redeem?tab=audit">
                  <ScrollText className="size-4" />
                  看兑换审计
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">批次为主线</CardTitle>
              <CardDescription>建议先从批次判断活动是否健康，再下钻到兑换码与审计记录。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">批次深链</CardTitle>
              <CardDescription>工作台内支持直接带 `batch_id` 跳到兑换码列表或审计页。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">导出仍保留</CardTitle>
              <CardDescription>现有导出、启停用与作废操作全部保留，只是入口集中到一个工作台。</CardDescription>
            </CardHeader>
          </Card>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {showTabsNavigation ? (
          <TabsList className="h-auto flex-wrap justify-start">
            {REDEEM_TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}
        {REDEEM_TABS.map((item) => {
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
