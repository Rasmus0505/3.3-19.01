import { Gift, LogOut, Menu, ScrollText, Settings2, Shield, Sparkles, Ticket, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AdminLogsTab } from "./features/admin-logs/AdminLogsTab";
import { AdminRatesTab } from "./features/admin-rates/AdminRatesTab";
import { AdminRedeemAuditTab } from "./features/admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "./features/admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "./features/admin-redeem/AdminRedeemCodesTab";
import { AdminSubtitleSettingsTab } from "./features/admin-subtitle-settings/AdminSubtitleSettingsTab";
import { AdminUsersTab } from "./features/admin-users/AdminUsersTab";
import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./shared/ui";
import { cn } from "./lib/utils";

const navItems = [
  {
    href: "/admin/users",
    label: "用户",
    icon: Users,
    eyebrow: "User Ops",
    title: "用户与积分运营",
    description: "搜索、排序、删除与手工调账集中在同一处，像成熟 SaaS 一样管理账户生命周期。",
  },
  {
    href: "/admin/logs",
    label: "流水",
    icon: ScrollText,
    eyebrow: "Billing Logs",
    title: "账务与消耗流水",
    description: "把预扣、消费、退款与兑换记录统一在同一张高可读性工作台里。",
  },
  {
    href: "/admin/rates",
    label: "计费配置",
    icon: Settings2,
    eyebrow: "Pricing",
    title: "模型计费与策略配置",
    description: "维护默认模型、费率开关与成本策略，保持现有接口与保存逻辑不变。",
  },
  {
    href: "/admin/subtitle-settings",
    label: "字幕配置",
    icon: Sparkles,
    eyebrow: "Subtitle",
    title: "字幕与分句默认项",
    description: "控制上传默认语义分句与阈值参数，形成更清晰的配置中心。",
  },
  {
    href: "/admin/redeem-batches",
    label: "兑换批次",
    icon: Gift,
    eyebrow: "Redeem Batch",
    title: "兑换批次管理",
    description: "集中管理批次创建、状态与面额，方便活动型发码与运营投放。",
  },
  {
    href: "/admin/redeem-codes",
    label: "兑换码列表",
    icon: Ticket,
    eyebrow: "Redeem Codes",
    title: "兑换码与导出中心",
    description: "启用、停用、废弃和导出动作被整理进统一的数据工作流。",
  },
  {
    href: "/admin/redeem-audit",
    label: "兑换审计",
    icon: ScrollText,
    eyebrow: "Redeem Audit",
    title: "兑换审计与追踪",
    description: "快速筛选成功与失败兑换，辅助复盘渠道、批次和异常问题。",
  },
];

export function AdminApp({ apiCall, onLogout }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeItem = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.href)) || navItems[0],
    [location.pathname],
  );
  const ActiveIcon = activeItem.icon;

  return (
    <div className="section-soft min-h-screen bg-background">
      <div className="container-wrapper py-4 md:py-6">
        <div className="container">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="apple-panel hidden h-[calc(100vh-3.5rem)] flex-col p-5 lg:flex">
              <div className="space-y-4">
                <div className="apple-kicker w-fit">
                  <Shield className="size-3.5" />
                  Admin Dashboard
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">更像成熟 SaaS 的后台工作台</h2>
                  <p className="text-sm leading-6 text-slate-500">主站与后台共用同一套 API、权限和积分体系，这里只重构信息层级与视觉呈现。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">7 个模块</Badge>
                  <Badge variant="outline">Inset Layout</Badge>
                </div>
              </div>

              <nav className="mt-5 flex-1 space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.href);
                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "dashboard-sidebar-link",
                        isActive && "bg-white/92 text-slate-950 shadow-[0_18px_44px_-34px_rgba(37,99,235,0.26)]",
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>

              <div className="space-y-2.5">
                <div className="rounded-[1.5rem] border border-white/70 bg-white/72 p-4">
                  <p className="apple-eyebrow">Environment</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">继续沿用当前 Zeabur 部署方式，无需新增复杂运维步骤。</p>
                </div>
                <Button variant="outline" asChild className="w-full justify-start">
                  <NavLink to="/">返回学习页</NavLink>
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={onLogout}>
                  <LogOut className="size-4" />
                  退出登录
                </Button>
              </div>
            </aside>

            <div className="min-w-0 space-y-4">
              <header className="apple-panel p-5 md:p-6 lg:p-7">
                <div className="apple-toolbar">
                  <div className="space-y-2.5">
                    <div className="apple-kicker w-fit">
                      <ActiveIcon className="size-3.5" />
                      {activeItem.eyebrow}
                    </div>
                    <div className="space-y-1.5">
                      <h1 className="text-[2rem] font-semibold tracking-tight text-slate-950 md:text-[2.6rem]">{activeItem.title}</h1>
                      <p className="max-w-2xl text-sm leading-6 text-slate-500">{activeItem.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">后台工作台</Badge>
                    <Badge variant="outline">主站同账户</Badge>
                    <Button variant="outline" size="sm" asChild className="hidden md:inline-flex lg:hidden">
                      <NavLink to="/">返回学习页</NavLink>
                    </Button>
                    <Button variant="outline" size="sm" className="hidden md:inline-flex lg:hidden" onClick={onLogout}>
                      <LogOut className="size-4" />
                      退出
                    </Button>
                    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="open-admin-menu">
                          <Menu className="size-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-[300px] border-white/70 bg-white/88 sm:w-[340px]">
                        <SheetHeader>
                          <SheetTitle>后台导航</SheetTitle>
                          <SheetDescription>在移动端快速切换管理模块与返回学习页。</SheetDescription>
                        </SheetHeader>
                        <div className="mt-6 grid gap-2">
                          {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname.startsWith(item.href);
                            return (
                              <Button key={item.href} asChild variant={isActive ? "default" : "outline"}>
                                <NavLink to={item.href} onClick={() => setMobileNavOpen(false)}>
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

                <div className="admin-page-summary mt-5">
                  <div>
                    <span className="apple-eyebrow">当前模块</span>
                    <strong>{activeItem.label}</strong>
                  </div>
                  <div>
                    <span className="apple-eyebrow">导航数量</span>
                    <strong>{navItems.length} 个</strong>
                  </div>
                  <div>
                    <span className="apple-eyebrow">布局状态</span>
                    <strong>Inset Dashboard</strong>
                  </div>
                </div>
              </header>

              <Routes>
                <Route index element={<Navigate to="users" replace />} />
                <Route path="users" element={<AdminUsersTab apiCall={apiCall} />} />
                <Route path="logs" element={<AdminLogsTab apiCall={apiCall} />} />
                <Route path="rates" element={<AdminRatesTab apiCall={apiCall} />} />
                <Route path="subtitle-settings" element={<AdminSubtitleSettingsTab apiCall={apiCall} />} />
                <Route path="redeem-batches" element={<AdminRedeemBatchesTab apiCall={apiCall} />} />
                <Route path="redeem-codes" element={<AdminRedeemCodesTab apiCall={apiCall} />} />
                <Route path="redeem-audit" element={<AdminRedeemAuditTab apiCall={apiCall} />} />
                <Route path="*" element={<Navigate to="users" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
