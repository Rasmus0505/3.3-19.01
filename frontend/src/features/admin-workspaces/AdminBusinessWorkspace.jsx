import { Gift, Users } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminRedeemAuditTab } from "../admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "../admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "../admin-redeem/AdminRedeemCodesTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { CardDescription, CardTitle } from "../../shared/ui";

const SECTION_PANELS = {
  users: [
    { value: "list", label: "用户列表", description: "先找用户，再沿着数据继续排查。", component: AdminUsersTab },
    { value: "wallet", label: "余额流水", description: "查看充值、扣点和余额变化。", component: AdminLogsTab },
    { value: "rates", label: "计费配置", description: "统一维护 ASR 与翻译模型计费。", component: AdminRatesTab },
  ],
  redeem: [
    { value: "batches", label: "兑换批次", description: "以批次为主线管理活动。", component: AdminRedeemBatchesTab },
    { value: "codes", label: "兑换码列表", description: "追具体兑换码状态。", component: AdminRedeemCodesTab },
    { value: "audit", label: "兑换审计", description: "核对兑换成功与失败记录。", component: AdminRedeemAuditTab },
  ],
};

const TAB_ALIASES = {
  list: "users",
  wallet: "users",
  rates: "users",
  batches: "redeem",
  codes: "redeem",
  audit: "redeem",
};

const PANEL_DEFAULTS = {
  users: "list",
  redeem: "batches",
};

const PANEL_ALIASES = {
  users: "list",
  redeem: "batches",
  list: "list",
  wallet: "wallet",
  rates: "rates",
  batches: "batches",
  codes: "codes",
  audit: "audit",
};

export const BUSINESS_TABS = [
  { value: "users", label: "用户计费", description: "用户、流水和计费参数集中处理。", icon: Users },
  { value: "redeem", label: "活动管理", description: "批次、兑换码与审计集中管理。", icon: Gift },
];

function scrollToPanel(panelValue) {
  const target = document.getElementById(`business-${panelValue}`);
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function normalizeTab(requestedTab) {
  if (BUSINESS_TABS.some((item) => item.value === requestedTab)) return requestedTab;
  return TAB_ALIASES[requestedTab] || "users";
}

function normalizePanel(tabValue, requestedPanel, requestedTab) {
  const fallback = PANEL_DEFAULTS[tabValue];
  const nextPanel = PANEL_ALIASES[requestedPanel || requestedTab] || fallback;
  return SECTION_PANELS[tabValue].some((item) => item.value === nextPanel) ? nextPanel : fallback;
}

export function AdminBusinessWorkspace({ apiCall }) {
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
          <section key={panel.value} id={`business-${panel.value}`} className="scroll-mt-24 space-y-3">
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
