import { AlertCircle, ArrowRight, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "../../shared/ui";
import { Progress } from "../../components/ui/progress";
import { cn } from "../../lib/utils";

function getVisualStatus(stage, currentStage, errorStage) {
  if (errorStage && stage.key === errorStage) return "failed";
  if (stage.status === "completed") return "completed";
  if (stage.key === currentStage || stage.status === "running") return "running";
  return "pending";
}

export function ReadingPipelinePanel({
  pipelineState,
  isGenerating = false,
  onContinue,
  onViewOriginal,
}) {
  const currentStage = pipelineState?.currentStage || null;
  const lastCompletedStage = pipelineState?.lastCompletedStage || null;
  const errorStage = pipelineState?.error?.stage || null;
  const stages = Array.isArray(pipelineState?.stages) ? pipelineState.stages : [];
  const activeStage =
    stages.find((stage) => stage.key === currentStage) ||
    stages.find((stage) => stage.key === errorStage) ||
    stages.find((stage) => stage.key === lastCompletedStage) ||
    stages[0] ||
    null;
  const nextStage =
    stages.find((stage) => stage.status === "pending" && stage.key !== currentStage) || null;

  return (
    <section className="reading-pipeline">
      <div className="reading-pipeline__header">
        <div>
          <p className="reading-pipeline__eyebrow">阅读生成流水线</p>
          <h2 className="reading-pipeline__title">把材料组装成沉浸式阅读课堂</h2>
          <p className="reading-pipeline__copy">
            先完成 i+1 改写，再把文章编排成老师主导的阅读课堂，而不是停留在静态阅读包。
          </p>
        </div>
        <span className={cn("reading-pipeline__status", pipelineState?.error && "reading-pipeline__status--failed")}>
          {pipelineState?.error ? <AlertCircle className="size-4" /> : <PlayCircle className="size-4" />}
          {pipelineState?.error ? "生成中断" : isGenerating ? "生成中" : "待继续"}
        </span>
      </div>

      {(pipelineState?.resumeAvailable || pipelineState?.restoredFromStorage) && lastCompletedStage ? (
        <div className="reading-pipeline__banner">
          <CheckCircle2 className="size-4" />
          <div>
            <p className="reading-pipeline__banner-title">已恢复到上次进度</p>
            <p className="reading-pipeline__banner-copy">
              最近完成阶段：{stages.find((stage) => stage.key === lastCompletedStage)?.label || lastCompletedStage}
            </p>
          </div>
        </div>
      ) : null}

      <div className="reading-pipeline__body">
        <div className="reading-pipeline__rail">
          {stages.map((stage, index) => {
            const visualStatus = getVisualStatus(stage, currentStage, errorStage);
            return (
              <div
                key={stage.key}
                className={cn(
                  "reading-pipeline__rail-item",
                  visualStatus === "running" && "reading-pipeline__rail-item--running",
                  visualStatus === "completed" && "reading-pipeline__rail-item--completed",
                  visualStatus === "failed" && "reading-pipeline__rail-item--failed",
                )}
              >
                <div className="reading-pipeline__rail-marker">{index + 1}</div>
                <div>
                  <p className="reading-pipeline__rail-label">{stage.label}</p>
                  <p className="reading-pipeline__rail-state">
                    {visualStatus === "completed"
                      ? "已完成"
                      : visualStatus === "running"
                        ? "进行中"
                        : visualStatus === "failed"
                          ? "失败"
                          : "等待开始"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="reading-pipeline__card">
          <div className="reading-pipeline__card-top">
            <div>
              <p className="reading-pipeline__card-label">当前阶段</p>
              <h3 className="reading-pipeline__card-title">
                {activeStage?.label || "正在启动流水线"}
              </h3>
            </div>
            {activeStage ? (
              <span className="reading-pipeline__card-pill">
                {pipelineState?.error
                  ? "需要恢复"
                  : currentStage
                    ? "推进中"
                    : lastCompletedStage
                      ? "已完成"
                      : "准备中"}
              </span>
            ) : null}
          </div>

          <p className="reading-pipeline__card-copy">
            {pipelineState?.error?.message ||
              activeStage?.detail ||
              "正在准备当前阶段的输入与输出。"}
          </p>

          <Progress
            className="reading-pipeline__progress"
            value={activeStage?.progressPercent || (pipelineState?.error ? 100 : 12)}
          />

          <div className="reading-pipeline__meta">
            {lastCompletedStage ? (
              <div className="reading-pipeline__meta-card">
                <span className="reading-pipeline__meta-label">上一步</span>
                <strong>{stages.find((stage) => stage.key === lastCompletedStage)?.label || lastCompletedStage}</strong>
              </div>
            ) : null}
            {nextStage ? (
              <div className="reading-pipeline__meta-card reading-pipeline__meta-card--muted">
                <span className="reading-pipeline__meta-label">下一步</span>
                <strong>{nextStage.label}</strong>
              </div>
            ) : null}
          </div>

          {pipelineState?.error ? (
            <div className="reading-pipeline__error">
              <p className="reading-pipeline__error-title">在“{activeStage?.label || pipelineState.error.stage}”阶段中断</p>
              <p className="reading-pipeline__error-copy">
                你可以继续生成，或先打开原文确认材料。若要排查，请在浏览器控制台搜索 `ReadingRewriteDebug` 并复制日志。
              </p>
            </div>
          ) : null}

          <div className="reading-pipeline__actions">
            <Button
              className="reading-pipeline__primary"
              onClick={onContinue}
              disabled={isGenerating}
            >
              {isGenerating ? "生成中..." : "继续生成"}
            </Button>
            <Button variant="outline" onClick={onViewOriginal}>
              查看原文
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
