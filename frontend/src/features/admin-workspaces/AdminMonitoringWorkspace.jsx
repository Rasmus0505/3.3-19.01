import { AlertTriangle, ClipboardList, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminLessonTaskLogsTab } from "../admin-logs/AdminLessonTaskLogsTab";
import { AdminTranslationLogsTab } from "../admin-logs/AdminTranslationLogsTab";
import { AdminOperationLogsTab } from "../admin-operation-logs/AdminOperationLogsTab";
import { AdminOverviewTab } from "../admin-overview/AdminOverviewTab";
import { AdminSqlConsoleTab } from "../admin-sql-console/AdminSqlConsoleTab";
import { AdminSubtitleSettingsTab } from "../admin-subtitle-settings/AdminSubtitleSettingsTab";
import { AdminSystemTab } from "../admin-system/AdminSystemTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { CardDescription, CardTitle } from "../../shared/ui";

const SECTION_PANELS = {
  health: [
    { value: "overview", label: "运行总览", description: "先看业务与告警概况。", component: AdminOverviewTab },
    { value: "system", label: "系统检查", description: "再看服务、数据库和依赖是否就绪。", component: AdminSystemTab },
  ],
  tasks: [
    { value: "task-failures", label: "生成失败", description: "追任务、课程和阶段错误。", component: AdminLessonTaskLogsTab },
    { value: "translations", label: "翻译记录", description: "补看翻译成功率和失败明细。", component: AdminTranslationLogsTab },
  ],
  operations: [
    { value: "operations", label: "操作审计", description: "检查后台敏感操作留痕。", component: AdminOperationLogsTab },
    { value: "sql-console", label: "SQL 控台", description: "执行受控 SQL 查询与 DML 写操作。", component: AdminSqlConsoleTab },
    { value: "subtitle-policy", label: "策略配置", description: "集中维护字幕与翻译默认策略。", component: AdminSubtitleSettingsTab },
  ],
};

const TAB_ALIASES = {
  overview: "health",
  system: "health",
  "task-failures": "tasks",
  translations: "tasks",
  operations: "operations",
  "sql-console": "operations",
  "subtitle-policy": "operations",
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
  "subtitle-policy": "subtitle-policy",
};

export const MONITORING_TABS = [
  { value: "health", label: "系统健康", description: "总览与系统检查合并成一个入口。", icon: ShieldCheck },
  { value: "tasks", label: "任务监控", description: "生成失败与翻译记录放在同一条排查链。", icon: AlertTriangle },
  { value: "operations", label: "操作审计", description: "操作留痕与策略配置合并查看。", icon: ClipboardList },
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

  return (
    <div className="space-y-4">
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
