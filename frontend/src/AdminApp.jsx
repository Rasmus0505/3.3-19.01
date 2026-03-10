import { Bug, Gift, LayoutDashboard, LogOut, Menu, ScrollText, Settings2, Shield, Sparkles, Ticket, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AdminLessonTaskLogsTab } from "./features/admin-logs/AdminLessonTaskLogsTab";
import { AdminLogsTab } from "./features/admin-logs/AdminLogsTab";
import { AdminTranslationLogsTab } from "./features/admin-logs/AdminTranslationLogsTab";
import { AdminOperationLogsTab } from "./features/admin-operation-logs/AdminOperationLogsTab";
import { AdminOverviewTab } from "./features/admin-overview/AdminOverviewTab";
import { AdminRatesTab } from "./features/admin-rates/AdminRatesTab";
import { AdminRedeemAuditTab } from "./features/admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "./features/admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "./features/admin-redeem/AdminRedeemCodesTab";
import { AdminSubtitleSettingsTab } from "./features/admin-subtitle-settings/AdminSubtitleSettingsTab";
import { AdminSystemTab } from "./features/admin-system/AdminSystemTab";
import { AdminUsersTab } from "./features/admin-users/AdminUsersTab";
import { Badge, Button, Separator, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./shared/ui";

export function AdminApp({ apiCall, onLogout }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { to: "/admin/overview", label: "总览", icon: LayoutDashboard, match: "/admin/overview" },
      { to: "/admin/users", label: "用户", icon: Users, match: "/admin/users" },
      { to: "/admin/logs", label: "余额流水", icon: ScrollText, match: "/admin/logs" },
      { to: "/admin/translation-logs", label: "翻译日志", icon: Sparkles, match: "/admin/translation-logs" },
      { to: "/admin/lesson-task-logs", label: "生成日志", icon: Bug, match: "/admin/lesson-task-logs" },
      { to: "/admin/operation-logs", label: "操作日志", icon: Shield, match: "/admin/operation-logs" },
      { to: "/admin/rates", label: "计费配置", icon: Settings2, match: "/admin/rates" },
      { to: "/admin/system", label: "系统状态", icon: Settings2, match: "/admin/system" },
      { to: "/admin/subtitle-settings", label: "字幕配置", icon: Sparkles, match: "/admin/subtitle-settings" },
      { to: "/admin/redeem-batches", label: "兑换批次", icon: Gift, match: "/admin/redeem-batches" },
      { to: "/admin/redeem-codes", label: "兑换码列表", icon: Ticket, match: "/admin/redeem-codes" },
      { to: "/admin/redeem-audit", label: "兑换审计", icon: ScrollText, match: "/admin/redeem-audit" },
    ],
    []
  );

  function isActive(match) {
    return location.pathname.startsWith(match);
  }

  return (
    <div className="section-soft min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="logo">
              <Shield className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Admin</span>
              <Badge variant="outline">P0 已升级</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              {navItems.slice(0, 7).map((item) => (
                <Badge key={item.to} variant={isActive(item.match) ? "default" : "outline"}>
                  {item.label}
                </Badge>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="hidden md:inline-flex">
                <NavLink to="/">返回学习页</NavLink>
              </Button>
              <Button variant="outline" size="sm" onClick={onLogout} className="hidden md:inline-flex">
                <LogOut className="size-4" />
                退出
              </Button>

              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="open-admin-menu">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px]">
                  <SheetHeader>
                    <SheetTitle>后台导航</SheetTitle>
                    <SheetDescription>在移动端快速切换管理页面。</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 grid gap-2">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button key={item.to} asChild variant={isActive(item.match) ? "default" : "outline"}>
                          <NavLink to={item.to} onClick={() => setMobileNavOpen(false)}>
                            <Icon className="size-4" />
                            {item.label}
                          </NavLink>
                        </Button>
                      );
                    })}
                    <Button asChild variant="outline">
                      <NavLink to="/" onClick={() => setMobileNavOpen(false)}>
                        返回学习页
                      </NavLink>
                    </Button>
                    <Button onClick={onLogout}>
                      <LogOut className="size-4" />
                      退出登录
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wrapper pb-6">
        <div className="container space-y-4 pt-4">
          <div className="hidden flex-wrap gap-2 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.to} asChild variant={isActive(item.match) ? "default" : "outline"}>
                  <NavLink to={item.to}>
                    <Icon className="size-4" />
                    {item.label}
                  </NavLink>
                </Button>
              );
            })}
          </div>

          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminOverviewTab apiCall={apiCall} />} />
            <Route path="users" element={<AdminUsersTab apiCall={apiCall} />} />
            <Route path="logs" element={<AdminLogsTab apiCall={apiCall} />} />
            <Route path="translation-logs" element={<AdminTranslationLogsTab apiCall={apiCall} />} />
            <Route path="lesson-task-logs" element={<AdminLessonTaskLogsTab apiCall={apiCall} />} />
            <Route path="operation-logs" element={<AdminOperationLogsTab apiCall={apiCall} />} />
            <Route path="rates" element={<AdminRatesTab apiCall={apiCall} />} />
            <Route path="system" element={<AdminSystemTab apiCall={apiCall} />} />
            <Route path="subtitle-settings" element={<AdminSubtitleSettingsTab apiCall={apiCall} />} />
            <Route path="redeem-batches" element={<AdminRedeemBatchesTab apiCall={apiCall} />} />
            <Route path="redeem-codes" element={<AdminRedeemCodesTab apiCall={apiCall} />} />
            <Route path="redeem-audit" element={<AdminRedeemAuditTab apiCall={apiCall} />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
