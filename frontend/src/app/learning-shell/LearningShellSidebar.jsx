import { BookOpenText, ChevronDown, History, LogIn, LogOut, RefreshCw, Search, Shield, Sparkles, UploadCloud, UserRound, Wifi, WifiOff } from "lucide-react";

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
import { WalletBadge } from "../../features/wallet/components/WalletBadge";
import { ConnectionStatusBadge } from "./components/ConnectionStatusBadge";
import { ADMIN_NAV_ITEMS } from "../../shared/lib/adminSearchParams";
import { PANEL_ROUTE_ITEMS, getPanelItemByPathname, getPanelPath } from "./panelRoutes";

export const PANEL_ITEMS = [
  {
    ...PANEL_ROUTE_ITEMS.find((item) => item.key === "account"),
    icon: UserRound,
  },
  {
    ...PANEL_ROUTE_ITEMS.find((item) => item.key === "history"),
    icon: History,
  },
  {
    ...PANEL_ROUTE_ITEMS.find((item) => item.key === "wordbook"),
    icon: BookOpenText,
  },
  {
    ...PANEL_ROUTE_ITEMS.find((item) => item.key === "upload"),
    icon: UploadCloud,
  },
  {
    ...PANEL_ROUTE_ITEMS.find((item) => item.key === "reading"),
    icon: BookOpenText,
  },
];

export const SIDEBAR_STORAGE_KEY = "app-shell-sidebar-open";

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
  isDesktopSync = false,
  syncStatus = "idle",
  syncInProgress = false,
  syncCompleted = 0,
  syncTotal = 0,
  lastSyncDisplay = null,
  onForceSync,
  pendingCounts = {},
  onOpenConflicts,
  isOnline = true,
  isSyncing = false,
  connectionStatus = "online",
  connectionLastSyncDisplay = null,
  connectionSyncedItems = 0,
}) {
  const { open, setOpen } = useSidebar();
  const expanded = mobile || open;
  const showSearchAction = Boolean(accessToken && hasLessons);
  const showAdminAction = Boolean(accessToken && isAdminUser);
  const showLogoutAction = Boolean(hasStoredToken);
  const visiblePanelItems = PANEL_ITEMS.filter((item) => {
    if (item.key === "account" || item.key === "wordbook") {
      return Boolean(accessToken);
    }
    return true;
  });
  const loginHint =
    authStatus === "expired"
      ? authStatusMessage || "登录已失效，请重新登录后继续上传、同步进度和进入管理台。"
      : "登录后可上传素材、同步进度，并在侧边栏进入管理台。";

  function handleAdminToggle() {
    if (!expanded) {
      setOpen(true);
      onAdminToggle?.(true);
      return;
    }
    const nextExpanded = !adminNavExpanded;
    onAdminToggle?.(nextExpanded);
  }

  function handleAdminSelect(item) {
    onAdminSelect?.(item);
  }

  return (
    <>
      <SidebarHeader className="justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            {expanded ? (
              <div className="min-w-0 space-y-2">
                <p className="truncate text-sm font-semibold">Unlock Anything</p>
                {accessToken ? <WalletBadge accessToken={accessToken} balancePoints={walletBalance} isOnline={isOnline} /> : null}
              </div>
            ) : null}
          </div>
          {!isDesktopSync ? (
            <ConnectionStatusBadge
              isOnline={isOnline}
              isSyncing={isSyncing}
              syncStatus={connectionStatus}
              lastSyncDisplay={connectionLastSyncDisplay}
              syncedItems={connectionSyncedItems}
            />
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {expanded ? <SidebarGroupLabel>学习导航</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {visiblePanelItems.map((item) => {
                const Icon = item.icon;
                const selected = activePanel === item.key;
                const guideId =
                  mobile
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
                      className="min-h-11 rounded-xl px-3 py-3"
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
                    <SidebarMenuButton collapsed={!expanded} onClick={onOpenSearch} title="查找课程" aria-label="查找课程" className="min-h-11 rounded-xl px-3 py-3">
                      <Search className="size-5 shrink-0" />
                      {expanded ? <span className="truncate font-medium">查找课程</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {showAdminAction ? (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton active={isAdminRoute} collapsed={!expanded} onClick={handleAdminToggle} title="管理台" aria-label="管理台" className="min-h-11 rounded-xl px-3 py-3">
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
                    <SidebarMenuButton collapsed={!expanded} onClick={onLogout} title="退出登录" aria-label="退出登录" className="min-h-11 rounded-xl px-3 py-3">
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
        {!accessToken ? (
          <div className="rounded-2xl border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <LogIn className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {expanded ? <p className="text-xs leading-5 text-muted-foreground">{loginHint}</p> : <span className="sr-only">{loginHint}</span>}
            </div>
          </div>
        ) : null}
        {isDesktopSync ? (
          <div className="rounded-2xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncStatus === "offline" ? (
                  <WifiOff className="size-4 shrink-0 text-muted-foreground" />
                ) : syncInProgress ? (
                  <RefreshCw className="size-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Wifi className="size-4 shrink-0 text-green-500" />
                )}
                {expanded ? (
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-xs font-medium">
                      {syncStatus === "offline"
                        ? "离线模式"
                        : syncInProgress
                          ? `同步中 ${syncCompleted}/${syncTotal}`
                          : syncStatus === "synced"
                            ? "已同步"
                            : syncStatus === "error"
                              ? "同步失败"
                              : "空闲"}
                    </p>
                    {lastSyncDisplay && (
                      <p className="truncate text-xs text-muted-foreground">上次同步：{lastSyncDisplay}</p>
                    )}
                  </div>
                ) : null}
              </div>
              {expanded && (syncInProgress || syncStatus === "error") ? (
                <button
                  onClick={onForceSync}
                  className="rounded-lg border bg-background px-2 py-1 text-xs hover:bg-muted"
                  title="手动同步"
                >
                  <RefreshCw className="size-3" />
                </button>
              ) : null}
            </div>
            {pendingCounts.courses > 0 || pendingCounts.progress > 0 ? (
              <div className="mt-1 flex gap-2">
                {pendingCounts.courses > 0 ? (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                    {pendingCounts.courses} 个课程待同步
                  </span>
                ) : null}
                {pendingCounts.progress > 0 ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {pendingCounts.progress} 个进度待同步
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </SidebarFooter>
    </>
  );
}
