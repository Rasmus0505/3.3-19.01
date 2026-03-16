import { ArrowRight } from "lucide-react";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui";
import { GETTING_STARTED_OVERVIEW, GETTING_STARTED_STEPS } from "./gettingStartedContent";

function StepSection({ step }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">步骤 {step.index}</p>
        <h3 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{step.title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{step.summary}</p>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-sm">
        <img src={step.image} alt={step.imageAlt} className="block h-auto w-full" loading="lazy" />
      </div>
    </section>
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
}) {
  const canStartGuide = Boolean(accessToken) && !isMobileViewport;
  const primaryActionLabel = accessToken
    ? canStartGuide
      ? progressState?.completed
        ? "重新开始引导"
        : "开始引导"
      : "去上传素材"
    : "先登录后开始引导";
  const handlePrimaryAction = accessToken ? (canStartGuide ? onStartGuide : onGoUpload) : onGoLogin;

  return (
    <>
      <div className="space-y-10">
        <section className="space-y-4 rounded-[32px] border border-border/80 bg-card/95 p-6 shadow-sm md:p-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{GETTING_STARTED_OVERVIEW.title}</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{GETTING_STARTED_OVERVIEW.description}</p>
          </div>

          <Button onClick={handlePrimaryAction} data-getting-started-primary="true" className="h-11 rounded-full px-5">
            {primaryActionLabel}
            {!accessToken || canStartGuide ? <ArrowRight className="size-4" /> : null}
          </Button>

          <div className="overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-sm">
            <img src={GETTING_STARTED_OVERVIEW.image} alt={GETTING_STARTED_OVERVIEW.imageAlt} className="block h-auto w-full" />
          </div>
        </section>

        <div className="space-y-8">
          {GETTING_STARTED_STEPS.map((step) => (
            <StepSection key={step.id} step={step} />
          ))}
        </div>
      </div>

      <Dialog open={showWelcomePrompt} onOpenChange={(open) => (!open ? onDismissWelcome?.() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>欢迎进入新手教程</DialogTitle>
            <DialogDescription>先看大图，再点“开始引导”，跟着真实按钮走一遍。</DialogDescription>
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
