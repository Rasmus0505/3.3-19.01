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
import { CardDescription, CardTitle } from "../../shared/ui";

const SECTION_PANELS = {
  health: [
    { value: "overview", label: "杩愯鎬昏", description: "鍏堢湅涓氬姟涓庡憡璀︽鍐点€?", component: AdminOverviewTab },
    { value: "system", label: "绯荤粺妫€鏌?", description: "鍐嶇湅鏈嶅姟銆佹暟鎹簱鍜屼緷璧栨槸鍚﹀氨缁€?", component: AdminSystemTab },
  ],
  tasks: [
    { value: "task-failures", label: "鐢熸垚澶辫触", description: "杩戒换鍔°€佽绋嬪拰闃舵閿欒銆?", component: AdminLessonTaskLogsTab },
    { value: "translations", label: "缈昏瘧璁板綍", description: "琛ョ湅缈昏瘧鎴愬姛鐜囧拰澶辫触鏄庣粏銆?", component: AdminTranslationLogsTab },
  ],
  operations: [
    { value: "operations", label: "鎿嶄綔瀹¤", description: "妫€鏌ュ悗鍙版晱鎰熸搷浣滅暀鐥曘€?", component: AdminOperationLogsTab },
    { value: "sql-console", label: "SQL 鎺у彴", description: "鎵ц鍙楁帶 SQL 鏌ヨ涓� DML 鍐欐搷浣溿€?", component: AdminSqlConsoleTab },
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
  { value: "health", label: "绯荤粺鍋ュ悍", description: "鎬昏涓庣郴缁熸鏌ュ悎骞舵垚涓� 涓叆鍙ｃ€?", icon: ShieldCheck },
  { value: "tasks", label: "浠诲姟鐩戞帶", description: "鐢熸垚澶辫触涓庣炕璇戣褰曟斁鍦ㄥ悓涓� 鏉℃帓鏌ラ摼銆?", icon: AlertTriangle },
  { value: "operations", label: "鎿嶄綔瀹¤", description: "鎿嶄綔鐣欑棔涓庣瓥鐣ラ厤缃悎骞舵煡鐪嬨€?", icon: ClipboardList },
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

