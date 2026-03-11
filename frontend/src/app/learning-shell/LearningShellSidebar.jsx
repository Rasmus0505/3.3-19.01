import { Gift, History, LogOut, Search, Shield, Sparkles, UploadCloud } from "lucide-react";

import {
  Button,
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
  hasLessons,
  onOpenSearch,
  onLogout,
  isAdminUser,
  onAdminNavigate,
  mobile = false,
}) {
  const { open } = useSidebar();
  const expanded = mobile || open;

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
      </SidebarContent>

      <SidebarFooter className="space-y-2">
        {mobile ? (
          <div className="grid gap-2">
            {hasLessons ? (
              <Button variant="outline" className="justify-start" onClick={onOpenSearch}>
                <Search className="size-4" />
                查找课程
              </Button>
            ) : null}
            {isAdminUser ? (
              <Button variant="outline" className="justify-start" onClick={onAdminNavigate}>
                <Shield className="size-4" />
                管理后台
              </Button>
            ) : null}
            {accessToken ? (
              <Button className="justify-start" onClick={onLogout}>
                <LogOut className="size-4" />
                退出登录
              </Button>
            ) : null}
          </div>
        ) : null}
      </SidebarFooter>
    </>
  );
}
