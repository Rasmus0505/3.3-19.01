import { Bug, Gift, LogOut, Menu, Shield, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AdminOpsWorkspace } from "./features/admin-workspaces/AdminOpsWorkspace";
import { AdminPipelineWorkspace } from "./features/admin-workspaces/AdminPipelineWorkspace";
import { AdminRedeemWorkspace } from "./features/admin-workspaces/AdminRedeemWorkspace";
import { AdminUsersWorkspace } from "./features/admin-workspaces/AdminUsersWorkspace";
import { Badge, Button, Separator, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./shared/ui";

function LegacyAdminRedirect({ to, tab }) {
  const location = useLocation();
  const nextSearchParams = new URLSearchParams(location.search);
  if (tab) nextSearchParams.set("tab", tab);
  const nextSearch = nextSearchParams.toString();
  return <Navigate to={`${to}${nextSearch ? `?${nextSearch}` : ""}`} replace />;
}

export function AdminApp({ apiCall, onLogout }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { to: "/admin/ops?tab=overview", label: "异常处置", icon: Shield, match: "/admin/ops" },
      { to: "/admin/pipeline?tab=task-failures", label: "生成链路", icon: Bug, match: "/admin/pipeline" },
      { to: "/admin/users?tab=list", label: "用户计费", icon: Users, match: "/admin/users" },
      { to: "/admin/redeem?tab=batches", label: "活动兑换", icon: Gift, match: "/admin/redeem" },
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
              <Badge variant="outline">4 个工作台</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              {navItems.map((item) => (
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
            <Route index element={<Navigate to="ops" replace />} />
            <Route path="ops" element={<AdminOpsWorkspace apiCall={apiCall} />} />
            <Route path="pipeline" element={<AdminPipelineWorkspace apiCall={apiCall} />} />
            <Route path="users" element={<AdminUsersWorkspace apiCall={apiCall} />} />
            <Route path="redeem" element={<AdminRedeemWorkspace apiCall={apiCall} />} />

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
    </div>
  );
}
