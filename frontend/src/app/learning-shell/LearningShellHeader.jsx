import { Menu, Search, Shield } from "lucide-react";

import { WalletBadge } from "../../features/wallet/WalletBadge";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SidebarTrigger,
} from "../../shared/ui";
import { LearningShellSidebar } from "./LearningShellSidebar";

export function LearningShellHeader({
  currentPanel,
  accessToken,
  lessonsCount,
  walletBalance,
  mobileNavOpen,
  setMobileNavOpen,
  activePanel,
  onPanelSelect,
  onOpenSearch,
  onLogout,
  isAdminUser,
  onAdminNavigate,
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container-wrapper">
        <div className="container flex min-h-16 items-center gap-3 py-3">
          <SidebarTrigger />
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="open-learning-sidebar">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[320px] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{currentPanel.title}</SheetTitle>
                <SheetDescription>在移动端切换学习面板、课程跳转与账号操作。</SheetDescription>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <LearningShellSidebar
                  activePanel={activePanel}
                  onPanelSelect={onPanelSelect}
                  accessToken={accessToken}
                  hasLessons={lessonsCount > 0}
                  onOpenSearch={() => {
                    onOpenSearch();
                    setMobileNavOpen(false);
                  }}
                  onLogout={onLogout}
                  isAdminUser={isAdminUser}
                  onAdminNavigate={() => {
                    setMobileNavOpen(false);
                    onAdminNavigate();
                  }}
                  mobile
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">学习中心</p>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold">{currentPanel.title}</h1>
              <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge>
              {accessToken ? <Badge variant="outline">{lessonsCount} 门课程</Badge> : null}
            </div>
            <p className="hidden text-xs text-muted-foreground md:block">{currentPanel.description}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {accessToken ? (
              <div className="hidden md:block">
                <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
              </div>
            ) : null}
            {accessToken && lessonsCount > 0 ? (
              <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={onOpenSearch}>
                <Search className="size-4" />
                查找课程
              </Button>
            ) : null}
            {isAdminUser ? (
              <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={onAdminNavigate}>
                <Shield className="size-4" />
                管理后台
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
