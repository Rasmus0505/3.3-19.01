import { BookOpenText, ChevronDown, Gift, History, LogIn, LogOut, Search, Shield, Sparkles, UploadCloud } from "lucide-react";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../../shared/ui";
import { ADMIN_NAV_ITEMS } from "../../shared/lib/adminSearchParams";
import { WalletBadge } from "../../features/wallet/WalletBadge";

export const PANEL_ITEMS = [
  {
    key: "getting-started",
    title: "新手教程",
    icon: BookOpenText,
    path: "/getting-started",
  },
  {
    key: "history",
    title: "历史记录",
    icon: History,
    path: "/",
  },
  {
    key: "upload",
    title: "上传素材",
    icon: UploadCloud,
    path: "/upload",
  },
  {
    key: "redeem",
    title: "兑换码充值",
    icon: Gift,
    path: "/redeem",
  },
];

export const SIDEBAR_STORAGE_KEY = "app-shell-sidebar-open";

export function getPanelItemByPathname(pathname) {
  if (pathname === "/help/getting-started") {
    return PANEL_ITEMS[0];
  }
  return PANEL_ITEMS.find((item) => item.path === pathname) || PANEL_ITEMS[0];
}

export function getPanelPath(panelKey) {
  return PANEL_ITEMS.find((item) => item.key === panelKey)?.path || "/";
}

export function LearningShellSidebar({
  activePanel,
  onPanelSelect,
  accessToken,
  walletBalance = 0,
  hasLessons,
  onOpenSearch,
  onLogout,
  hasStoredToken = false,
  authStatus = "anonymous",
  authStatusMessage = "",
  isAdminUser,
  isAdminRoute = false,
  activeAdminKey = "",
  adminNavExpanded = false,
  onAdminToggle,
  onAdminSelect,
  mobile = false,
}) {
  const { open, setOpen } = useSidebar();
  const expanded = mobile || open;
  const showSearchAction = Boolean(accessToken && hasLessons);
  const showAdminAction = Boolean(accessToken && isAdminUser);
  const showLogoutAction = Boolean(hasStoredToken);
  const loginHint =
    authStatus === "expired"
      ? authStatusMessage || "登录已失效，请重新登录后继续上传、同步和进入管理台。"
      : "登录后可上传素材、同步进度，并在侧边栏进入管理台。";

  function handleAdminToggle() {
    if (!expanded) {
      setOpen(true);
      onAdminToggle?.(true);
      console.debug("[DEBUG] learning-admin-nav-expand", { source: "collapsed-sidebar" });
      return;
    }
    const nextExpanded = !adminNavExpanded;
    console.debug("[DEBUG] learning-admin-nav-toggle", { nextExpanded, mobile });
    onAdminToggle?.(nextExpanded);
  }

  function handleAdminSelect(item) {
    console.debug("[DEBUG] learning-admin-nav-select", { key: item.key, href: item.href });
    onAdminSelect?.(item);
  }

  return (
    <>
      <SidebarHeader className="justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          {expanded ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">English Trainer</p>
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {expanded ? <SidebarGroupLabel>学习导航</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {PANEL_ITEMS.map((item) => {
                const Icon = item.icon;
                const selected = activePanel === item.key;
                const guideId =
                  mobile || item.key === "getting-started"
                    ? undefined
                    : item.key === "upload"
                      ? "sidebar-upload"
                      : item.key === "history"
                        ? "sidebar-history"
                        : undefined;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      active={selected}
                      collapsed={!expanded}
                      onClick={() => onPanelSelect(item.key)}
                      data-guide-id={guideId}
                    >
                      <Icon className="size-5 shrink-0" />
                      {expanded ? <span className="truncate font-medium">{item.title}</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showSearchAction || showAdminAction || showLogoutAction ? (
          <SidebarGroup>
            {expanded ? <SidebarGroupLabel>快捷操作</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {showSearchAction ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      collapsed={!expanded}
                      onClick={onOpenSearch}
                      title="查找课程"
                      aria-label="查找课程"
                    >
                      <Search className="size-5 shrink-0" />
                      {expanded ? <span className="truncate font-medium">查找课程</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {showAdminAction ? (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        active={isAdminRoute}
                        collapsed={!expanded}
                        onClick={handleAdminToggle}
                        title="管理台"
                        aria-label="管理台"
                      >
                        <Shield className="size-5 shrink-0" />
                        {expanded ? (
                          <>
                            <span className="truncate font-medium">管理台</span>
                            <ChevronDown
                              className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${adminNavExpanded ? "rotate-180" : ""}`}
                            />
                          </>
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {expanded && adminNavExpanded
                      ? ADMIN_NAV_ITEMS.map((item) => (
                          <SidebarMenuItem key={item.key}>
                            <SidebarMenuButton
                              active={activeAdminKey === item.key}
                              collapsed={false}
                              onClick={() => handleAdminSelect(item)}
                              title={item.label}
                              aria-label={item.label}
                              className="min-h-11 rounded-xl border-transparent py-2.5 pl-11 pr-3"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-foreground">{item.label}</span>
                                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                              </span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))
                      : null}
                  </>
                ) : null}
                {showLogoutAction ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      collapsed={!expanded}
                      onClick={onLogout}
                      title="退出登录"
                      aria-label="退出登录"
                    >
                      <LogOut className="size-5 shrink-0" />
                      {expanded ? <span className="truncate font-medium">退出登录</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="space-y-2">
        {accessToken && expanded ? (
          <div className="rounded-2xl border bg-muted/30 p-3">
            <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
          </div>
        ) : null}
        {!accessToken ? (
          <div className="rounded-2xl border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <LogIn className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {expanded ? (
                <p className="text-xs leading-5 text-muted-foreground">{loginHint}</p>
              ) : (
                <span className="sr-only">{loginHint}</span>
              )}
            </div>
          </div>
        ) : null}
        {expanded ? (
          <p className="text-xs text-muted-foreground">学习页和管理台共用这一套左侧导航，进入管理台后只在这里展开子项。</p>
        ) : null}
      </SidebarFooter>
    </>
  );
}
