import { LogOut, Menu, ScrollText, Settings2, Shield, Users } from "lucide-react";
import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AdminLogsTab } from "./features/admin-logs/AdminLogsTab";
import { AdminRatesTab } from "./features/admin-rates/AdminRatesTab";
import { AdminUsersTab } from "./features/admin-users/AdminUsersTab";
import { Badge, Button, Separator, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./shared/ui";

export function AdminApp({ apiCall, onLogout }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isUsersTab = location.pathname.startsWith("/admin/users");
  const isLogsTab = location.pathname.startsWith("/admin/logs");
  const isRatesTab = location.pathname.startsWith("/admin/rates");

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
              <Badge variant="outline">shadcn style</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant={isUsersTab ? "default" : "outline"}>用户</Badge>
              <Badge variant={isLogsTab ? "default" : "outline"}>流水</Badge>
              <Badge variant={isRatesTab ? "default" : "outline"}>计费</Badge>
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
                <SheetContent side="right" className="w-[260px]">
                  <SheetHeader>
                    <SheetTitle>后台导航</SheetTitle>
                    <SheetDescription>在移动端快速切换管理页面。</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 grid gap-2">
                    <Button asChild variant={isUsersTab ? "default" : "outline"}>
                      <NavLink to="/admin/users" onClick={() => setMobileNavOpen(false)}>
                        <Users className="size-4" />
                        用户
                      </NavLink>
                    </Button>
                    <Button asChild variant={isLogsTab ? "default" : "outline"}>
                      <NavLink to="/admin/logs" onClick={() => setMobileNavOpen(false)}>
                        <ScrollText className="size-4" />
                        流水
                      </NavLink>
                    </Button>
                    <Button asChild variant={isRatesTab ? "default" : "outline"}>
                      <NavLink to="/admin/rates" onClick={() => setMobileNavOpen(false)}>
                        <Settings2 className="size-4" />
                        计费配置
                      </NavLink>
                    </Button>
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
            <Button asChild variant={isUsersTab ? "default" : "outline"}>
              <NavLink to="/admin/users">
                <Users className="size-4" />
                用户
              </NavLink>
            </Button>
            <Button asChild variant={isLogsTab ? "default" : "outline"}>
              <NavLink to="/admin/logs">
                <ScrollText className="size-4" />
                流水
              </NavLink>
            </Button>
            <Button asChild variant={isRatesTab ? "default" : "outline"}>
              <NavLink to="/admin/rates">
                <Settings2 className="size-4" />
                计费配置
              </NavLink>
            </Button>
          </div>

          <Routes>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersTab apiCall={apiCall} />} />
            <Route path="logs" element={<AdminLogsTab apiCall={apiCall} />} />
            <Route path="rates" element={<AdminRatesTab apiCall={apiCall} />} />
            <Route path="*" element={<Navigate to="users" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
