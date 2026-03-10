import { Bug, Gift, LogOut, Menu, Shield, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { AdminOpsWorkspace, OPS_TABS } from "./features/admin-workspaces/AdminOpsWorkspace";
import { AdminPipelineWorkspace, PIPELINE_TABS } from "./features/admin-workspaces/AdminPipelineWorkspace";
import { AdminRedeemWorkspace, REDEEM_TABS } from "./features/admin-workspaces/AdminRedeemWorkspace";
import { AdminUsersWorkspace, USERS_TABS } from "./features/admin-workspaces/AdminUsersWorkspace";
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

function LegacyAdminRedirect({ to, tab }) {
  const location = useLocation();
  const nextSearchParams = new URLSearchParams(location.search);
  if (tab) nextSearchParams.set("tab", tab);
  const nextSearch = nextSearchParams.toString();
  return <Navigate to={`${to}${nextSearch ? `?${nextSearch}` : ""}`} replace />;
}

function buildAdminHref(basePath, tabValue) {
  return `${basePath}?tab=${tabValue}`;
}

function AdminSidebarNavigation({
  workspaceItems,
  activeWorkspace,
  activeTabItem,
  onWorkspaceSelect,
  onTabSelect,
  onBackToLearning,
  onLogout,
  mobile = false,
}) {
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
              <p className="truncate text-xs text-muted-foreground">4 个工作台统一入口</p>
            </div>
          ) : null}
        </div>
        {expanded && !mobile ? <Badge variant="outline">运营台</Badge> : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {expanded ? <SidebarGroupLabel>工作台</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => {
                const Icon = item.icon;
                const selected = activeWorkspace.key === item.key;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton active={selected} collapsed={!expanded} onClick={() => onWorkspaceSelect(item)}>
                      <Icon className="size-5 shrink-0" />
                      {expanded ? (
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{item.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.caption}</span>
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          {expanded ? <SidebarGroupLabel>{activeWorkspace.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {activeWorkspace.tabs.map((item) => {
                const selected = activeTabItem.value === item.value;
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton active={selected} collapsed={!expanded} onClick={() => onTabSelect(item.value)}>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                        {item.label.slice(0, 1)}
                      </span>
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
      </SidebarContent>

      <SidebarFooter className="space-y-2">
        {expanded ? (
          <p className="text-xs text-muted-foreground">旧 `/admin/*?tab=` 深链保持兼容，侧边栏点击会自动同步 URL。</p>
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

  const workspaceItems = useMemo(
    () => [
      {
        key: "ops",
        label: "异常处置",
        caption: "健康、系统、留痕",
        icon: Shield,
        path: "/admin/ops",
        tabs: OPS_TABS,
      },
      {
        key: "pipeline",
        label: "生成链路",
        caption: "任务、翻译、字幕策略",
        icon: Bug,
        path: "/admin/pipeline",
        tabs: PIPELINE_TABS,
      },
      {
        key: "users",
        label: "用户计费",
        caption: "用户、流水、计费参数",
        icon: Users,
        path: "/admin/users",
        tabs: USERS_TABS,
      },
      {
        key: "redeem",
        label: "活动兑换",
        caption: "批次、兑换码、审计",
        icon: Gift,
        path: "/admin/redeem",
        tabs: REDEEM_TABS,
      },
    ],
    [],
  );

  const activeWorkspace = useMemo(
    () => workspaceItems.find((item) => location.pathname.startsWith(item.path)) || workspaceItems[0],
    [location.pathname, workspaceItems],
  );
  const requestedTab = useMemo(() => new URLSearchParams(location.search).get("tab") || "", [location.search]);
  const activeTabItem = useMemo(
    () => activeWorkspace.tabs.find((item) => item.value === requestedTab) || activeWorkspace.tabs[0],
    [activeWorkspace, requestedTab],
  );

  function handleWorkspaceSelect(item) {
    setMobileNavOpen(false);
    navigate(buildAdminHref(item.path, item.tabs[0]?.value || ""));
  }

  function handleTabSelect(tabValue) {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.set("tab", tabValue);
    nextSearchParams.delete("page");
    setMobileNavOpen(false);
    navigate({ pathname: activeWorkspace.path, search: `?${nextSearchParams.toString()}` });
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
            workspaceItems={workspaceItems}
            activeWorkspace={activeWorkspace}
            activeTabItem={activeTabItem}
            onWorkspaceSelect={handleWorkspaceSelect}
            onTabSelect={handleTabSelect}
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
                      <SheetDescription>切换工作台与子页面。</SheetDescription>
                    </SheetHeader>
                    <div className="flex h-full flex-col">
                      <AdminSidebarNavigation
                        workspaceItems={workspaceItems}
                        activeWorkspace={activeWorkspace}
                        activeTabItem={activeTabItem}
                        onWorkspaceSelect={handleWorkspaceSelect}
                        onTabSelect={handleTabSelect}
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
                    <h1 className="truncate text-base font-semibold">{activeWorkspace.label}</h1>
                    <Badge variant="outline">{activeTabItem.label}</Badge>
                    <Badge variant="secondary" className="hidden md:inline-flex">
                      4 个工作台
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{activeTabItem.description}</p>
                </div>

                <div className="ml-auto hidden items-center gap-2 md:flex">
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
                <Route index element={<Navigate to="ops" replace />} />
                <Route path="ops" element={<AdminOpsWorkspace apiCall={apiCall} showTabsNavigation={false} />} />
                <Route path="pipeline" element={<AdminPipelineWorkspace apiCall={apiCall} showTabsNavigation={false} />} />
                <Route path="users" element={<AdminUsersWorkspace apiCall={apiCall} showTabsNavigation={false} />} />
                <Route path="redeem" element={<AdminRedeemWorkspace apiCall={apiCall} showTabsNavigation={false} />} />

                <Route path="overview" element={<LegacyAdminRedirect to="/admin/ops" tab="overview" />} />
                <Route path="system" element={<LegacyAdminRedirect to="/admin/ops" tab="system" />} />
                <Route path="operation-logs" element={<LegacyAdminRedirect to="/admin/ops" tab="operations" />} />
                <Route path="lesson-task-logs" element={<LegacyAdminRedirect to="/admin/pipeline" tab="task-failures" />} />
                <Route path="translation-logs" element={<LegacyAdminRedirect to="/admin/pipeline" tab="translations" />} />
                <Route path="subtitle-settings" element={<LegacyAdminRedirect to="/admin/pipeline" tab="subtitle-policy" />} />
                <Route path="logs" element={<LegacyAdminRedirect to="/admin/users" tab="wallet" />} />
                <Route path="rates" element={<LegacyAdminRedirect to="/admin/users" tab="rates" />} />
                <Route path="redeem-batches" element={<LegacyAdminRedirect to="/admin/redeem" tab="batches" />} />
                <Route path="redeem-codes" element={<LegacyAdminRedirect to="/admin/redeem" tab="codes" />} />
                <Route path="redeem-audit" element={<LegacyAdminRedirect to="/admin/redeem" tab="audit" />} />
                <Route path="*" element={<Navigate to="ops" replace />} />
              </Routes>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
