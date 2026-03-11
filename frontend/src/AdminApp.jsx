import { Activity, AlertTriangle, LogOut, Menu, Shield, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { AdminBusinessWorkspace, BUSINESS_TABS } from "./features/admin-workspaces/AdminBusinessWorkspace";
import { AdminMonitoringWorkspace, MONITORING_TABS } from "./features/admin-workspaces/AdminMonitoringWorkspace";
import { useErrorCopyShortcut } from "./shared/hooks/useErrorCopyShortcut";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./shared/ui";

const SIDEBAR_STORAGE_KEY = "app-shell-sidebar-open";

const MONITORING_TAB_MAP = {
  health: "health",
  overview: "health",
  system: "health",
  tasks: "tasks",
  "task-failures": "tasks",
  translations: "tasks",
  operations: "operations",
  "subtitle-policy": "operations",
};

const MONITORING_PANEL_MAP = {
  health: "overview",
  overview: "overview",
  system: "system",
  tasks: "task-failures",
  "task-failures": "task-failures",
  translations: "translations",
  operations: "operations",
  "subtitle-policy": "subtitle-policy",
};

const BUSINESS_TAB_MAP = {
  users: "users",
  list: "users",
  wallet: "users",
  rates: "users",
  redeem: "redeem",
  batches: "redeem",
  codes: "redeem",
  audit: "redeem",
};

const BUSINESS_PANEL_MAP = {
  users: "list",
  list: "list",
  wallet: "wallet",
  rates: "rates",
  redeem: "batches",
  batches: "batches",
  codes: "codes",
  audit: "audit",
};

function buildAdminHref(basePath, tabValue, panelValue) {
  const searchParams = new URLSearchParams();
  if (tabValue) searchParams.set("tab", tabValue);
  if (panelValue) searchParams.set("panel", panelValue);
  const nextSearch = searchParams.toString();
  return `${basePath}${nextSearch ? `?${nextSearch}` : ""}`;
}

function resolveActiveTab(pathname, requestedTab) {
  if (pathname.startsWith("/admin/business")) {
    return BUSINESS_TAB_MAP[requestedTab] || "users";
  }
  return MONITORING_TAB_MAP[requestedTab] || "health";
}

function resolveNavigationState(pathname, requestedTab, navigationGroups) {
  const activeGroup = navigationGroups.find((item) => pathname.startsWith(item.path)) || navigationGroups[0];
  const activeTab = resolveActiveTab(pathname, requestedTab);
  const activeItem = activeGroup.items.find((item) => item.value === activeTab) || activeGroup.items[0];
  return { activeGroup, activeItem };
}

function LegacyAdminRedirect({ to, fallbackTab, fallbackPanel, tabMap = {}, panelMap = {} }) {
  const location = useLocation();
  const nextSearchParams = new URLSearchParams(location.search);
  const requestedTab = nextSearchParams.get("tab") || "";
  const mappedTab = tabMap[requestedTab] || fallbackTab;
  const mappedPanel = panelMap[nextSearchParams.get("panel") || ""] || panelMap[requestedTab] || fallbackPanel;
  nextSearchParams.set("tab", mappedTab);
  if (mappedPanel) nextSearchParams.set("panel", mappedPanel);
  else nextSearchParams.delete("panel");
  const nextSearch = nextSearchParams.toString();
  return <Navigate to={`${to}${nextSearch ? `?${nextSearch}` : ""}`} replace />;
}

function AdminSidebarNavigation({ navigationGroups, activeItem, onItemSelect, onBackToLearning, onLogout, mobile = false }) {
  const { open } = useSidebar();
  const expanded = mobile || open;

  return (
    <>
      <SidebarHeader className="justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary">
            <Shield className="size-5" />
          </div>
          {expanded ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Admin Console</p>
              <p className="truncate text-xs text-muted-foreground">2 个核心工作台，5 个直达入口</p>
            </div>
          ) : null}
        </div>
        {expanded && !mobile ? <Badge variant="outline">运营台</Badge> : null}
      </SidebarHeader>

      <SidebarContent>
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.key}>
            {expanded ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected = activeItem.key === item.key;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton active={selected} collapsed={!expanded} onClick={() => onItemSelect(group, item)}>
                        <Icon className="size-5 shrink-0" />
                        {expanded ? (
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{item.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                          </span>
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="space-y-2">
        {expanded ? (
          <>
            <p className="text-xs text-muted-foreground">旧 `/admin/*?tab=` 深链会自动重定向到当前分区，Ctrl+Shift+C 可复制最近错误。</p>
            <p className="text-xs text-muted-foreground">面向 Zeabur 运营：优先看状态、复制错误、再做修复。</p>
          </>
        ) : null}
        {mobile ? (
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start" onClick={onBackToLearning}>
              返回学习页
            </Button>
            <Button className="justify-start" onClick={onLogout}>
              <LogOut className="size-4" />
              退出登录
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
    </>
  );
}

export function AdminApp({ apiCall, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useErrorCopyShortcut();

  const requestedTab = useMemo(() => new URLSearchParams(location.search).get("tab") || "", [location.search]);

  const navigationGroups = useMemo(
    () => [
      {
        key: "monitoring",
        label: "运营监控",
        path: "/admin/monitoring",
        items: MONITORING_TABS.map((item) => ({ ...item, key: `monitoring:${item.value}`, href: buildAdminHref("/admin/monitoring", item.value) })),
      },
      {
        key: "business",
        label: "业务管理",
        path: "/admin/business",
        items: BUSINESS_TABS.map((item) => ({ ...item, key: `business:${item.value}`, href: buildAdminHref("/admin/business", item.value) })),
      },
    ],
    [],
  );

  const { activeGroup, activeItem } = useMemo(() => resolveNavigationState(location.pathname, requestedTab, navigationGroups), [location.pathname, navigationGroups, requestedTab]);

  function handleItemSelect(group, item) {
    setMobileNavOpen(false);
    console.debug("[DEBUG] admin-nav-select", { group: group.key, tab: item.value, href: item.href });
    navigate(item.href);
  }

  function handleBackToLearning() {
    setMobileNavOpen(false);
    navigate("/");
  }

  return (
    <SidebarProvider storageKey={SIDEBAR_STORAGE_KEY}>
      <div className="section-soft min-h-screen bg-background md:flex">
        <Sidebar className="bg-background/95">
          <AdminSidebarNavigation
            navigationGroups={navigationGroups}
            activeItem={activeItem}
            onItemSelect={handleItemSelect}
            onBackToLearning={handleBackToLearning}
            onLogout={onLogout}
          />
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="container-wrapper">
              <div className="container flex min-h-16 flex-wrap items-center gap-3 py-3">
                <SidebarTrigger />
                <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="open-admin-sidebar">
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[320px] p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>后台导航</SheetTitle>
                      <SheetDescription>切换后台分区与业务入口。</SheetDescription>
                    </SheetHeader>
                    <div className="flex h-full flex-col">
                      <AdminSidebarNavigation
                        navigationGroups={navigationGroups}
                        activeItem={activeItem}
                        onItemSelect={handleItemSelect}
                        onBackToLearning={handleBackToLearning}
                        onLogout={onLogout}
                        mobile
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">后台管理</p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="truncate text-base font-semibold">{activeItem.label}</h1>
                    <Badge variant="outline">{activeGroup.label}</Badge>
                    <Badge variant="secondary" className="hidden md:inline-flex">
                      2 个核心工作台
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{activeItem.description}</p>
                </div>

                <div className="ml-auto hidden items-center gap-2 xl:flex">
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin/monitoring?tab=health&panel=overview")}>
                    <Activity className="size-4" />
                    系统健康
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin/monitoring?tab=tasks&panel=task-failures&status=error")}>
                    <AlertTriangle className="size-4" />
                    任务监控
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin/business?tab=users&panel=list")}>
                    <Users className="size-4" />
                    用户管理
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <NavLink to="/">返回学习页</NavLink>
                  </Button>
                  <Button variant="outline" size="sm" onClick={onLogout}>
                    <LogOut className="size-4" />
                    退出
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="container-wrapper pb-6">
            <div className="container space-y-4 pt-4">
              <Routes>
                <Route index element={<Navigate to="monitoring?tab=health&panel=overview" replace />} />
                <Route path="monitoring" element={<AdminMonitoringWorkspace apiCall={apiCall} />} />
                <Route path="business" element={<AdminBusinessWorkspace apiCall={apiCall} />} />

                <Route
                  path="ops"
                  element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="health" fallbackPanel="overview" tabMap={MONITORING_TAB_MAP} panelMap={MONITORING_PANEL_MAP} />}
                />
                <Route
                  path="pipeline"
                  element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="tasks" fallbackPanel="task-failures" tabMap={MONITORING_TAB_MAP} panelMap={MONITORING_PANEL_MAP} />}
                />
                <Route
                  path="users"
                  element={<LegacyAdminRedirect to="/admin/business" fallbackTab="users" fallbackPanel="list" tabMap={BUSINESS_TAB_MAP} panelMap={BUSINESS_PANEL_MAP} />}
                />
                <Route
                  path="redeem"
                  element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="batches" tabMap={BUSINESS_TAB_MAP} panelMap={BUSINESS_PANEL_MAP} />}
                />

                <Route path="overview" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="health" fallbackPanel="overview" />} />
                <Route path="system" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="health" fallbackPanel="system" />} />
                <Route path="operation-logs" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="operations" fallbackPanel="operations" />} />
                <Route path="lesson-task-logs" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="tasks" fallbackPanel="task-failures" />} />
                <Route path="translation-logs" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="tasks" fallbackPanel="translations" />} />
                <Route path="subtitle-settings" element={<LegacyAdminRedirect to="/admin/monitoring" fallbackTab="operations" fallbackPanel="subtitle-policy" />} />
                <Route path="logs" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="users" fallbackPanel="wallet" />} />
                <Route path="rates" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="users" fallbackPanel="rates" />} />
                <Route path="redeem-batches" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="batches" />} />
                <Route path="redeem-codes" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="codes" />} />
                <Route path="redeem-audit" element={<LegacyAdminRedirect to="/admin/business" fallbackTab="redeem" fallbackPanel="audit" />} />
                <Route path="*" element={<Navigate to="monitoring?tab=health&panel=overview" replace />} />
              </Routes>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
