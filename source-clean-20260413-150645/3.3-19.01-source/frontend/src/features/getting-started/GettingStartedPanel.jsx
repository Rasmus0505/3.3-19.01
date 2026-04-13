import { useState } from "react";
import { BookOpenText, ChevronLeft, ChevronRight, LogIn, Sparkles, UploadCloud } from "lucide-react";

import { Button } from "../../shared/ui";
import { GETTING_STARTED_OVERVIEW, GETTING_STARTED_STEPS } from "./gettingStartedContent";

function WelcomeCard({ onStartGuide, onGoLogin, onGoUpload }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">{GETTING_STARTED_OVERVIEW.title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{GETTING_STARTED_OVERVIEW.description}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button onClick={onGoLogin} variant="outline" className="min-h-11 flex-1 gap-2">
          <LogIn className="size-4" />
          登录或注册
        </Button>
        <Button onClick={onGoUpload} className="min-h-11 flex-1 gap-2">
          <UploadCloud className="size-4" />
          上传素材
        </Button>
      </div>

      <div className="rounded-2xl border border-dashed bg-muted/30 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">5 步快速上手</p>
        <div className="space-y-2">
          {GETTING_STARTED_STEPS.map((step) => (
            <div key={step.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {step.index}
              </span>
              <span className="text-sm text-foreground">{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {onStartGuide ? (
        <Button onClick={onStartGuide} variant="secondary" className="w-full gap-2">
          <BookOpenText className="size-4" />
          开始新手引导
        </Button>
      ) : null}
    </div>
  );
}

function StepCard({ step, isMobile, onPrevious, onNext, hasPrevious, hasNext }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {step.index}
          </span>
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">步骤</span>
        </div>
        <h3 className="text-lg font-bold text-foreground sm:text-xl">{step.title}</h3>
      </div>

      {step.summary ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{step.summary}</p>
      ) : null}

      {step.image && (
        <div className="overflow-hidden rounded-2xl border bg-muted/20">
          <img
            src={step.image}
            alt={step.imageAlt || step.title}
            className="w-full object-cover"
            style={isMobile ? { maxHeight: "45vh" } : { maxHeight: "50vh" }}
            loading="lazy"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="min-h-9 gap-1"
        >
          <ChevronLeft className="size-4" />
          上一步
        </Button>

        <Button
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
          className="min-h-9 gap-1"
        >
          {hasNext ? (
            <>
              下一步
              <ChevronRight className="size-4" />
            </>
          ) : (
            "完成"
          )}
        </Button>
      </div>
    </div>
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
  const isCompleted = Boolean(progressState?.completed);
  const isVisited = Boolean(progressState?.homeVisited);

  const [currentStep, setCurrentStep] = useState(0);

  const showWelcome = !isCompleted && (showWelcomePrompt || !isVisited) && !accessToken;
  const showSteps = !isCompleted && (isCompleted === false && isVisited && !accessToken);

  const handleDismiss = () => {
    onDismissWelcome?.();
  };

  const handleStartGuide = () => {
    onStartGuide?.();
  };

  const handleGoLogin = () => {
    onGoLogin?.();
  };

  const handleGoUpload = () => {
    onGoUpload?.();
  };

  const handleGoHistory = () => {
    onGoHistory?.();
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    if (currentStep < GETTING_STARTED_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  if (isCompleted) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
          <div className="mb-3 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Sparkles className="size-7 text-primary" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-foreground">你已经完成新手教程</h3>
          <p className="mt-1 text-sm text-muted-foreground">可以开始学习课程或上传新素材了。</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {onGoHistory ? (
              <Button variant="outline" onClick={handleGoHistory}>
                查看历史课程
              </Button>
            ) : null}
            {onGoUpload ? (
              <Button onClick={handleGoUpload}>
                <UploadCloud className="mr-2 size-4" />
                上传素材
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (showWelcome || (showWelcomePrompt && !accessToken)) {
    return (
      <div className="space-y-4">
        <WelcomeCard
          onStartGuide={handleStartGuide}
          onGoLogin={handleGoLogin}
          onGoUpload={handleGoUpload}
        />
      </div>
    );
  }

  if (showSteps || (isVisited && !accessToken)) {
    const allSteps = [GETTING_STARTED_OVERVIEW, ...GETTING_STARTED_STEPS];
    const adjustedIndex = currentStep + 1;
    const isOverview = currentStep === 0;

    if (isOverview) {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-foreground sm:text-xl">{GETTING_STARTED_OVERVIEW.title}</h2>
            <p className="text-sm text-muted-foreground sm:text-base">{GETTING_STARTED_OVERVIEW.description}</p>
          </div>

          {GETTING_STARTED_OVERVIEW.image && (
            <div className="overflow-hidden rounded-2xl border bg-muted/20">
              <img
                src={GETTING_STARTED_OVERVIEW.image}
                alt={GETTING_STARTED_OVERVIEW.imageAlt}
                className="w-full object-cover"
                style={{ maxHeight: isMobileViewport ? "40vh" : "55vh" }}
                loading="lazy"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleNext} className="min-h-9 gap-1">
              开始第一步
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      );
    }

    const currentStepItem = GETTING_STARTED_STEPS[currentStep - 1];
    if (!currentStepItem) {
      return (
        <div className="space-y-4">
          <WelcomeCard
            onStartGuide={handleStartGuide}
            onGoLogin={handleGoLogin}
            onGoUpload={handleGoUpload}
          />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <StepCard
          step={{ ...currentStepItem, index: String(adjustedIndex).padStart(2, "0") }}
          isMobile={isMobileViewport}
          onPrevious={handlePrevious}
          onNext={handleNext}
          hasPrevious={true}
          hasNext={currentStep < GETTING_STARTED_STEPS.length - 1}
        />

        <div className="flex justify-center gap-1.5">
          {[...Array(GETTING_STARTED_STEPS.length)].map((_, i) => (
            <button
              key={i}
              type="button"
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep - 1
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/30"
              }`}
              onClick={() => setCurrentStep(i + 1)}
              aria-label={`跳转到步骤 ${i + 1}`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WelcomeCard
        onStartGuide={handleStartGuide}
        onGoLogin={handleGoLogin}
        onGoUpload={handleGoUpload}
      />
    </div>
  );
}
