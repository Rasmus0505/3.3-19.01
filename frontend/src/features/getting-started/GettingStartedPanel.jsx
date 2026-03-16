import { ArrowRight, CheckCircle2, CircleAlert, MonitorSmartphone, MousePointerClick, Smartphone } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui";
import { GETTING_STARTED_OVERVIEW, GETTING_STARTED_STEPS } from "./gettingStartedContent";

function StepCard({ step }) {
  return (
    <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">步骤 {step.index}</Badge>
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{step.title}</span>
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">{step.goal}</p>

          <div className="mt-5 space-y-3">
            {step.actions.map((action, index) => (
              <div key={action} className="flex items-start gap-3 rounded-2xl border bg-muted/20 px-4 py-3">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </div>
                <p className="text-sm leading-6">{action}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">为什么做</p>
              <p className="mt-2 text-sm leading-6">{step.why}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="size-4" />
                <p className="text-xs font-medium uppercase tracking-[0.16em]">成功验证</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">{step.success}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-700">
                <CircleAlert className="size-4" />
                <p className="text-xs font-medium uppercase tracking-[0.16em]">失败先看这里</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">{step.failureHint}</p>
            </div>
          </div>
        </div>

        <div className="border-t bg-muted/20 p-5 md:p-6 xl:border-l xl:border-t-0">
          <div className="overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-sm">
            <img src={step.image} alt={step.imageAlt} className="block w-full object-cover" loading="lazy" />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">截图使用当前产品界面，并直接标出这一步最该点的位置。</p>
        </div>
      </div>
    </Card>
  );
}

export function GettingStartedPanel({
  accessToken,
  isMobileViewport = false,
  progressState,
  showWelcomePrompt = false,
  onStartGuide,
  onDismissWelcome,
  onGoLogin,
  onGoUpload,
  onGoHistory,
}) {
  const canStartGuide = Boolean(accessToken) && !isMobileViewport;
  const primaryActionLabel = accessToken ? (canStartGuide ? (progressState?.completed ? "重新开始引导" : "开始引导") : "移动端先看图文") : "先登录后开始引导";

  return (
    <>
      <div className="space-y-6">
        <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_380px]">
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">新手教程</Badge>
                <Badge variant="outline">左侧侧边栏首位</Badge>
                <Badge variant="outline">桌面端真实点选引导</Badge>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{GETTING_STARTED_OVERVIEW.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{GETTING_STARTED_OVERVIEW.description}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {GETTING_STARTED_OVERVIEW.flow.map((item, index) => (
                  <div key={item} className="flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm shadow-sm">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={accessToken ? (canStartGuide ? onStartGuide : onGoUpload) : onGoLogin} data-getting-started-primary="true">
                  {primaryActionLabel}
                  {!accessToken || canStartGuide ? <ArrowRight className="size-4" /> : null}
                </Button>
                {accessToken ? (
                  <Button variant="outline" onClick={onGoUpload}>
                    去上传素材
                  </Button>
                ) : (
                  <Button variant="outline" onClick={onGoLogin}>
                    去登录
                  </Button>
                )}
                {accessToken ? (
                  <Button variant="ghost" onClick={onGoHistory}>
                    去历史记录
                  </Button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MousePointerClick className="size-4 text-primary" />
                    真实点击
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">桌面端引导不会替你点按钮，必须由你自己点击高亮目标。</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MonitorSmartphone className="size-4 text-primary" />
                    同一入口
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">教程作为学习壳正式内容页保留在左侧，不再跳去独立帮助站。</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {isMobileViewport ? <Smartphone className="size-4 text-primary" /> : <CheckCircle2 className="size-4 text-primary" />}
                    当前设备提示
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {isMobileViewport
                      ? "移动端本轮先看截图和说明；完整点选引导请在桌面端打开。"
                      : accessToken
                        ? "已登录桌面端可以直接开始真引导。"
                        : "未登录也能先看图文；登录后才会解锁真引导。"}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t bg-muted/20 p-6 md:p-8 xl:border-l xl:border-t-0">
              <div className="overflow-hidden rounded-[32px] border border-border/80 bg-background shadow-sm">
                <img src={GETTING_STARTED_OVERVIEW.image} alt={GETTING_STARTED_OVERVIEW.imageAlt} className="block w-full object-cover" />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">教程首页保留在当前产品壳内，左侧学习导航会始终可见。</p>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {GETTING_STARTED_STEPS.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      </div>

      <Dialog open={showWelcomePrompt} onOpenChange={(open) => (!open ? onDismissWelcome?.() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>欢迎进入新手教程</DialogTitle>
            <DialogDescription>
              这次不会直接替你点按钮。先看一遍真实截图，再点“开始引导”，我会只高亮你下一步该点的真实位置。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={onDismissWelcome}>
              稍后再看
            </Button>
            <Button onClick={onStartGuide}>开始引导</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
