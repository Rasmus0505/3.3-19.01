import { Gift, History, LogIn, LogOut, Search, Shield, Sparkles, UploadCloud } from "lucide-react";

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
import { WalletBadge } from "../../features/wallet/WalletBadge";

export const PANEL_ITEMS = [
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
  onAdminNavigate,
  mobile = false,
}) {
  const { open } = useSidebar();
  const expanded = mobile || open;
  const showSearchAction = Boolean(accessToken && hasLessons);
  const showAdminAction = Boolean(accessToken && isAdminUser);
  const showLogoutAction = Boolean(hasStoredToken);
  const loginHint =
    authStatus === "expired"
      ? authStatusMessage || "登录已失效，请重新登录后继续上传、同步和进入管理台。"
      : "登录后可上传素材、同步进度，并在侧边栏进入管理后台。";

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
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton active={selected} collapsed={!expanded} onClick={() => onPanelSelect(item.key)}>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      collapsed={!expanded}
                      onClick={onAdminNavigate}
                      title="管理后台"
                      aria-label="管理后台"
                    >
                      <Shield className="size-5 shrink-0" />
                      {expanded ? <span className="truncate font-medium">管理后台</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
          <p className="text-xs text-muted-foreground">右上角快捷入口已统一移到这里，桌面和移动端用同一套操作区。</p>
        ) : null}
      </SidebarFooter>
    </>
  );
}
