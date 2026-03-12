import { Menu } from "lucide-react";
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
  walletBalance = 0,
  mobileNavOpen,
  setMobileNavOpen,
  activePanel,
  onPanelSelect,
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
}) {
  const showLessonsBadge = accessToken && !isAdminRoute;

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
                <SheetDescription>{isAdminRoute ? "在移动端展开管理台子项、切换后台页面与账号操作。" : "在移动端切换学习面板、课程跳转与账号操作。"}</SheetDescription>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <LearningShellSidebar
                  activePanel={activePanel}
                  onPanelSelect={onPanelSelect}
                  accessToken={accessToken}
                  walletBalance={walletBalance}
                  hasLessons={lessonsCount > 0}
                  onOpenSearch={() => {
                    onOpenSearch();
                    setMobileNavOpen(false);
                  }}
                  onLogout={onLogout}
                  hasStoredToken={hasStoredToken}
                  authStatus={authStatus}
                  authStatusMessage={authStatusMessage}
                  isAdminUser={isAdminUser}
                  isAdminRoute={isAdminRoute}
                  activeAdminKey={activeAdminKey}
                  adminNavExpanded={adminNavExpanded}
                  onAdminToggle={(nextExpanded) => {
                    onAdminToggle?.(nextExpanded);
                  }}
                  onAdminSelect={(item) => {
                    setMobileNavOpen(false);
                    onAdminSelect?.(item);
                  }}
                  mobile
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold">{currentPanel.title}</h1>
              {showLessonsBadge ? <Badge variant="outline">{lessonsCount} 门课程</Badge> : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
