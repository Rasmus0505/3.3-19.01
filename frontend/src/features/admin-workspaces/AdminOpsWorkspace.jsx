import { AlertTriangle, ClipboardList, Settings2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminOperationLogsTab } from "../admin-operation-logs/AdminOperationLogsTab";
import { AdminOverviewTab } from "../admin-overview/AdminOverviewTab";
import { AdminSystemTab } from "../admin-system/AdminSystemTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

const OPS_TABS = [
  { value: "overview", label: "处置总览", description: "先看健康、关键指标和快捷入口。", component: AdminOverviewTab },
  { value: "system", label: "系统状态", description: "确认服务、数据库和后台接口是否就绪。", component: AdminSystemTab },
  { value: "operations", label: "操作记录", description: "追最近的敏感后台动作。", component: AdminOperationLogsTab },
];

export function AdminOpsWorkspace({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = readStringParam(searchParams, "tab");
  const activeTab = OPS_TABS.some((item) => item.value === requestedTab) ? requestedTab : "overview";

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
                <CardTitle className="text-lg">异常处置工作台</CardTitle>
                <Badge variant="outline">默认首页</Badge>
              </div>
              <CardDescription>把“先看哪里、再去哪修”集中到一个入口，减少在后台页面之间来回跳。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=task-failures&status=error">
                  <AlertTriangle className="size-4" />
                  查看生成失败
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=translations&success=false">
                  <Sparkles className="size-4" />
                  查看翻译失败
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=subtitle-policy">
                  <Settings2 className="size-4" />
                  调整字幕策略
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4" />
                故障排查入口
              </CardTitle>
              <CardDescription>先看失败明细，再决定是否需要调参数。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4" />
                操作留痕
              </CardTitle>
              <CardDescription>敏感动作统一在这里核对，避免误操作难追踪。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="size-4" />
                运行状态
              </CardTitle>
              <CardDescription>Zeabur 上优先确认 `/health`、`/health/ready` 与后台接口可达。</CardDescription>
            </CardHeader>
          </Card>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          {OPS_TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {OPS_TABS.map((item) => {
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
