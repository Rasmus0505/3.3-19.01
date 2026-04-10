import { Gauge, Loader2, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "../../shared/ui";
import { cn } from "../../lib/utils";
import { CEFR_LEVELS, formatEstimateTime } from "./readingDiagnostics";

function MetricCard({ label, value, hint, tone = "neutral" }) {
  return (
    <div className={cn("diagnostic-card", `diagnostic-card--${tone}`)}>
      <span className="diagnostic-card__label">{label}</span>
      <strong className="diagnostic-card__value">{value}</strong>
      <span className="diagnostic-card__hint">{hint}</span>
    </div>
  );
}

export function DiagnosticPanel({
  userLevel = "B1",
  snapshot = null,
  isDiagnosing = false,
  diagnosticError = null,
  isGenerating = false,
  onTargetLevelChange,
  onRetryDiagnosis,
  onContinueGeneration,
  onEditAgain,
}) {
  if (isDiagnosing) {
    return (
      <aside className="diagnostic-panel">
        <div className="diagnostic-panel__loading">
          <Loader2 className="size-5 animate-spin" />
          <div>
            <p className="diagnostic-panel__loading-title">正在诊断材料…</p>
            <p className="diagnostic-panel__loading-copy">先分析难度、目标等级和改写影响，再进入生成。</p>
          </div>
        </div>
      </aside>
    );
  }

  if (!snapshot) {
    return (
      <aside className="diagnostic-panel">
        <div className="diagnostic-panel__empty">
          <Gauge className="size-5" />
          <div>
            <p className="diagnostic-panel__empty-title">先放入一篇英文材料</p>
            <p className="diagnostic-panel__empty-copy">粘贴新材料或打开历史草稿，先查看诊断结果，再决定是否生成 i+1 阅读包。</p>
          </div>
        </div>
      </aside>
    );
  }

  const {
    materialDifficulty,
    recommendedTargetLevel,
    selectedTargetLevel,
    preservedI1Count,
    aboveI1Count,
    simplificationImpactPercent,
    estimatedChargeYuan,
    estimatedSeconds,
    fitMessage,
    levelCounts,
    diagnosedAt,
  } = snapshot;

  const totalWords = snapshot.totalWords || 1;

  return (
    <aside className="diagnostic-panel">
      <div className="diagnostic-panel__header">
        <div>
          <p className="diagnostic-panel__eyebrow">材料诊断台</p>
          <h2 className="diagnostic-panel__title">先看诊断，再决定要不要生成</h2>
        </div>
        <span className="diagnostic-panel__status">
          <Sparkles className="size-3.5" />
          {diagnosedAt ? "继续生成" : "待生成"}
        </span>
      </div>

      <section className="diagnostic-section">
        <div className="diagnostic-triad">
          <MetricCard label="材料难度" value={materialDifficulty} hint="基于本地 CEFR 分析得出" />
          <MetricCard label="当前等级" value={userLevel} hint="来自你的账号 CEFR 设定" tone="accent" />
          <MetricCard label="建议目标" value={recommendedTargetLevel} hint="推荐的 i+1 生成目标" tone="accent-soft" />
        </div>
        {fitMessage ? <p className="diagnostic-panel__fit-copy">{fitMessage}</p> : null}
      </section>

      <section className="diagnostic-section">
        <div className="diagnostic-section__head">
          <span className="diagnostic-section__label">目标等级</span>
          <span className="diagnostic-section__hint">A1-C2 全量可调</span>
        </div>
        <div className="diagnostic-targets" role="radiogroup" aria-label="目标等级">
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={cn(
                "diagnostic-target",
                selectedTargetLevel === level && "diagnostic-target--active",
                recommendedTargetLevel === level && "diagnostic-target--recommended"
              )}
              onClick={() => onTargetLevelChange?.(level)}
              aria-pressed={selectedTargetLevel === level}
            >
              <span>{level}</span>
              {recommendedTargetLevel === level ? (
                <span className="diagnostic-target__badge">推荐</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="diagnostic-section">
        <div className="diagnostic-section__head">
          <span className="diagnostic-section__label">影响记分牌</span>
          <span className="diagnostic-section__hint">首屏展示保留与改写规模</span>
        </div>
        <div className="diagnostic-scoreboard">
          <MetricCard label="保留 i+1 词" value={preservedI1Count} hint={`目标 ${selectedTargetLevel} 词项`} tone="success" />
          <MetricCard label="超纲表达" value={aboveI1Count} hint="建议进入改写队列" tone="warning" />
          <MetricCard label="改写影响" value={`${simplificationImpactPercent}%`} hint="占整篇词汇的大致比例" />
        </div>
      </section>

      <section className="diagnostic-section">
        <div className="diagnostic-section__head">
          <span className="diagnostic-section__label">难度分布</span>
          <span className="diagnostic-section__hint">{snapshot.totalWords || 0} 词</span>
        </div>
        <div className="diagnostic-distribution">
          <div className="diagnostic-distribution__bar">
            {[...CEFR_LEVELS, "SUPER"].map((level) => {
              const count = levelCounts?.[level] || 0;
              const width = Math.max(count > 0 ? (count / totalWords) * 100 : 0, count > 0 ? 4 : 0);
              return (
                <span
                  key={level}
                  className={cn("diagnostic-distribution__segment", `diagnostic-distribution__segment--${level.toLowerCase()}`)}
                  style={{ width: `${width}%` }}
                  title={`${level}: ${count}`}
                />
              );
            })}
          </div>
          <div className="diagnostic-distribution__legend">
            {[...CEFR_LEVELS, "SUPER"].map((level) => (
              <span key={level} className="diagnostic-distribution__legend-item">
                <span className={cn("diagnostic-distribution__dot", `diagnostic-distribution__dot--${level.toLowerCase()}`)} />
                {level === "SUPER" ? "超纲" : level}
                <strong>{levelCounts?.[level] || 0}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="diagnostic-section">
        <div className="diagnostic-estimate">
          <div className="diagnostic-estimate__item">
            <span className="diagnostic-estimate__label">预计耗时</span>
            <strong>{formatEstimateTime(estimatedSeconds)}</strong>
          </div>
          <div className="diagnostic-estimate__item">
            <span className="diagnostic-estimate__label">预计费用</span>
            <strong>{estimatedChargeYuan !== null ? `${estimatedChargeYuan.toFixed(2)} 元` : "登录后显示"}</strong>
          </div>
        </div>
      </section>

      {diagnosticError ? (
        <section className="diagnostic-panel__error" role="alert">
          <p className="diagnostic-panel__error-title">诊断失败</p>
          <p className="diagnostic-panel__error-copy">{diagnosticError}</p>
        </section>
      ) : null}

      <div className="diagnostic-panel__footer">
        <Button className="diagnostic-panel__primary" onClick={onContinueGeneration} disabled={isGenerating || isDiagnosing}>
          {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          继续生成
        </Button>
        <div className="diagnostic-panel__footer-actions">
          <Button variant="outline" onClick={onRetryDiagnosis} disabled={isDiagnosing || isGenerating}>
            <RefreshCw className="size-4" />
            重新诊断
          </Button>
          <Button variant="ghost" onClick={onEditAgain} disabled={isGenerating}>
            重新输入
          </Button>
        </div>
      </div>
    </aside>
  );
}
