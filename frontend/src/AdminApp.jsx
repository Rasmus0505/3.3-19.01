import { Gift, LogOut, Menu, ScrollText, Settings2, Shield, Ticket, Users } from "lucide-react";
import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AdminRedeemAuditTab } from "./features/admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "./features/admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "./features/admin-redeem/AdminRedeemCodesTab";
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
  const isRedeemBatchesTab = location.pathname.startsWith("/admin/redeem-batches");
  const isRedeemCodesTab = location.pathname.startsWith("/admin/redeem-codes");
  const isRedeemAuditTab = location.pathname.startsWith("/admin/redeem-audit");

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
              <Badge variant={isRedeemBatchesTab ? "default" : "outline"}>批次</Badge>
              <Badge variant={isRedeemCodesTab ? "default" : "outline"}>兑换码</Badge>
              <Badge variant={isRedeemAuditTab ? "default" : "outline"}>审计</Badge>
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
                    <Button asChild variant={isRedeemBatchesTab ? "default" : "outline"}>
                      <NavLink to="/admin/redeem-batches" onClick={() => setMobileNavOpen(false)}>
                        <Gift className="size-4" />
                        兑换批次
                      </NavLink>
                    </Button>
                    <Button asChild variant={isRedeemCodesTab ? "default" : "outline"}>
                      <NavLink to="/admin/redeem-codes" onClick={() => setMobileNavOpen(false)}>
                        <Ticket className="size-4" />
                        兑换码列表
                      </NavLink>
                    </Button>
                    <Button asChild variant={isRedeemAuditTab ? "default" : "outline"}>
                      <NavLink to="/admin/redeem-audit" onClick={() => setMobileNavOpen(false)}>
                        <ScrollText className="size-4" />
                        兑换审计
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
            <Button asChild variant={isRedeemBatchesTab ? "default" : "outline"}>
              <NavLink to="/admin/redeem-batches">
                <Gift className="size-4" />
                兑换批次
              </NavLink>
            </Button>
            <Button asChild variant={isRedeemCodesTab ? "default" : "outline"}>
              <NavLink to="/admin/redeem-codes">
                <Ticket className="size-4" />
                兑换码列表
              </NavLink>
            </Button>
            <Button asChild variant={isRedeemAuditTab ? "default" : "outline"}>
              <NavLink to="/admin/redeem-audit">
                <ScrollText className="size-4" />
                兑换审计
              </NavLink>
            </Button>
          </div>

          <Routes>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersTab apiCall={apiCall} />} />
            <Route path="logs" element={<AdminLogsTab apiCall={apiCall} />} />
            <Route path="rates" element={<AdminRatesTab apiCall={apiCall} />} />
            <Route path="redeem-batches" element={<AdminRedeemBatchesTab apiCall={apiCall} />} />
            <Route path="redeem-codes" element={<AdminRedeemCodesTab apiCall={apiCall} />} />
            <Route path="redeem-audit" element={<AdminRedeemAuditTab apiCall={apiCall} />} />
            <Route path="*" element={<Navigate to="users" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
