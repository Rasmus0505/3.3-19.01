import { AlertTriangle, ClipboardList, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminLessonTaskLogsTab } from "../admin-logs/AdminLessonTaskLogsTab";
import { AdminTranslationLogsTab } from "../admin-logs/AdminTranslationLogsTab";
import { AdminOperationLogsTab } from "../admin-operation-logs/AdminOperationLogsTab";
import { AdminOverviewTab } from "../admin-overview/AdminOverviewTab";
import { AdminSqlConsoleTab } from "../admin-sql-console/AdminSqlConsoleTab";
import { AdminSystemTab } from "../admin-system/AdminSystemTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger } from "../../shared/ui";

const SECTION_PANELS = {
  health: [
    { value: "overview", label: "运行总览", description: "先看趋势、异常和快捷入口，再决定排查顺序。", component: AdminOverviewTab },
    { value: "system", label: "系统检查", description: "确认服务、数据库、媒体依赖和 Bottle 运行状态。", component: AdminSystemTab },
  ],
  tasks: [
    { value: "task-failures", label: "生成失败", description: "按任务、课程和阶段定位失败原因。", component: AdminLessonTaskLogsTab },
    { value: "translations", label: "翻译记录", description: "补看翻译成功率、报错和请求细节。", component: AdminTranslationLogsTab },
  ],
  operations: [
    { value: "operations", label: "操作审计", description: "核对后台敏感动作和关键变更留痕。", component: AdminOperationLogsTab },
    { value: "sql-console", label: "SQL 控制台", description: "执行受控查询，处理只允许管理员操作的数据修复。", component: AdminSqlConsoleTab },
  ],
};

const TAB_ALIASES = {
  overview: "health",
  system: "health",
  "task-failures": "tasks",
  translations: "tasks",
  operations: "operations",
  "sql-console": "operations",
};

const PANEL_DEFAULTS = {
  health: "overview",
  tasks: "task-failures",
  operations: "operations",
};

const PANEL_ALIASES = {
  health: "overview",
  tasks: "task-failures",
  operations: "operations",
  overview: "overview",
  system: "system",
  "task-failures": "task-failures",
  translations: "translations",
  "sql-console": "sql-console",
};

export const MONITORING_TABS = [
  { value: "health", label: "健康概览", description: "总览、系统检查和 Bottle 运行诊断。", icon: ShieldCheck },
  { value: "tasks", label: "任务失败", description: "生成失败和翻译失败集中排查。", icon: AlertTriangle },
  { value: "operations", label: "操作审计", description: "后台日志与 SQL 诊断能力。", icon: ClipboardList },
];

function scrollToPanel(panelValue) {
  const target = document.getElementById(`monitoring-${panelValue}`);
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function normalizeTab(requestedTab) {
  if (MONITORING_TABS.some((item) => item.value === requestedTab)) return requestedTab;
  return TAB_ALIASES[requestedTab] || "health";
}

function normalizePanel(tabValue, requestedPanel, requestedTab) {
  const fallback = PANEL_DEFAULTS[tabValue];
  const nextPanel = PANEL_ALIASES[requestedPanel || requestedTab] || fallback;
  return SECTION_PANELS[tabValue].some((item) => item.value === nextPanel) ? nextPanel : fallback;
}

export function AdminMonitoringWorkspace({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = readStringParam(searchParams, "tab");
  const requestedPanel = readStringParam(searchParams, "panel");
  const activeTab = normalizeTab(requestedTab);
  const activePanel = normalizePanel(activeTab, requestedPanel, requestedTab);

  useEffect(() => {
    if (requestedTab === activeTab && requestedPanel === activePanel) return;
    setSearchParams(mergeSearchParams(searchParams, { tab: activeTab, panel: activePanel }), { replace: true });
  }, [activePanel, activeTab, requestedPanel, requestedTab, searchParams, setSearchParams]);

  useEffect(() => {
    if (!activePanel) return;
    scrollToPanel(activePanel);
  }, [activePanel]);

  function handleTabChange(nextTab) {
    setSearchParams(mergeSearchParams(searchParams, { tab: nextTab, panel: PANEL_DEFAULTS[nextTab] }));
  }

  function handlePanelChange(nextPanel) {
    setSearchParams(mergeSearchParams(searchParams, { tab: activeTab, panel: nextPanel }));
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <AlertTriangle className="size-3.5" />
                诊断只读区
              </div>
              <div>
                <CardTitle className="text-lg">排障中心</CardTitle>
                <CardDescription>把健康、失败、翻译和操作日志收敛到同一路由里，先判断问题在哪一层，再进入对应面板。</CardDescription>
              </div>
            </div>
            <Badge variant="outline">Troubleshooting</Badge>
          </div>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
            <TabsList className="h-auto flex-wrap justify-start">
              {MONITORING_TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid gap-3 md:grid-cols-3">
            {MONITORING_TABS.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.value} className={activeTab === item.value ? "border-primary/40 shadow-none" : "border-dashed shadow-none"}>
                  <CardHeader className="space-y-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="size-4" />
                      {item.label}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {SECTION_PANELS[activeTab].map((panel) => (
              <Button key={panel.value} variant={panel.value === activePanel ? "default" : "outline"} size="sm" onClick={() => handlePanelChange(panel.value)}>
                {panel.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">当前面板将保留深链参数 `tab` 和 `panel`，便于从总览卡片直接跳到具体故障面板。</p>
        </CardContent>
      </Card>

      {SECTION_PANELS[activeTab].map((panel) => {
        const Component = panel.component;
        return (
          <section key={panel.value} id={`monitoring-${panel.value}`} className="scroll-mt-24 space-y-3">
            <div className="space-y-1">
              <CardTitle className="text-base">{panel.label}</CardTitle>
              <CardDescription>{panel.description}</CardDescription>
            </div>
            <Component apiCall={apiCall} />
          </section>
        );
      })}
    </div>
  );
}
