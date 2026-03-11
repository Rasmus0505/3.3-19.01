import { Coins, Gift, Settings2, Ticket, Users } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminLogsTab } from "../admin-logs/AdminLogsTab";
import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminRedeemAuditTab } from "../admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "../admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "../admin-redeem/AdminRedeemCodesTab";
import { AdminUsersTab } from "../admin-users/AdminUsersTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

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

  const activeSection = useMemo(() => BUSINESS_TABS.find((item) => item.value === activeTab) || BUSINESS_TABS[0], [activeTab]);

  function handlePanelJump(panelValue) {
    console.debug("[DEBUG] admin-business-panel-jump", { tab: activeTab, panel: panelValue });
    setSearchParams(mergeSearchParams(searchParams, { tab: activeTab, panel: panelValue }));
    scrollToPanel(panelValue);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">业务管理</CardTitle>
                <Badge variant="outline">users + redeem</Badge>
              </div>
              <CardDescription>把用户计费与活动兑换收敛到两个直接入口，减少找用户、看流水、看活动时的重复跳转。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/business?tab=users&panel=list">
                  <Users className="size-4" />
                  查用户
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/business?tab=users&panel=wallet">
                  <Coins className="size-4" />
                  看流水
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/business?tab=redeem&panel=batches">
                  <Ticket className="size-4" />
                  看活动
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {BUSINESS_TABS.map((item) => {
            const Icon = item.icon;
            const active = item.value === activeSection.value;
            return (
              <button
                key={item.value}
                type="button"
                className={`rounded-3xl border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-dashed hover:border-primary/40"}`}
                onClick={() => setSearchParams(mergeSearchParams(searchParams, { tab: item.value, panel: PANEL_DEFAULTS[item.value] }))}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4" />
                  {item.label}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{activeSection.label}</CardTitle>
          <CardDescription>{activeSection.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SECTION_PANELS[activeTab].map((panel) => (
            <Button key={panel.value} type="button" variant={panel.value === activePanel ? "default" : "outline"} size="sm" onClick={() => handlePanelJump(panel.value)}>
              {panel.label}
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">旧用户/兑换深链会自动折叠到当前分区并滚动到对应模块。</span>
        </CardContent>
      </Card>

      {SECTION_PANELS[activeTab].map((panel) => {
        const Component = panel.component;
        return (
          <section key={panel.value} id={`business-${panel.value}`} className="scroll-mt-24 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium">{panel.label}</h2>
              <p className="text-sm text-muted-foreground">{panel.description}</p>
            </div>
            <Component apiCall={apiCall} />
          </section>
        );
      })}
    </div>
  );
}
