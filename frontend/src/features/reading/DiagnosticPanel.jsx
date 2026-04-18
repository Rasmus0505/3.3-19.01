import { Loader2, RefreshCw, WandSparkles } from "lucide-react";
import { Button } from "../../shared/ui";
import { cn } from "../../lib/utils";
import { COLLINS_LEVELS, formatEstimateTime } from "./readingDiagnostics";

export function DiagnosticPanel({
  userLevel = 3,
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
      <aside className="diagnostic-panel diagnostic-panel--loading">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="diagnostic-panel__loading-title">正在分析材料…</p>
      </aside>
    );
  }

  if (!snapshot) {
    return (
      <aside className="diagnostic-panel diagnostic-panel--empty">
        <p className="text-muted-foreground text-sm">粘贴文章后自动分析</p>
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
  } = snapshot;

  const totalWords = snapshot.totalWords || 1;

  return (
    <aside className="diagnostic-panel">

      {/* ── 三项核心指标 ── */}
      <div className="dp-triad">
        <div className="dp-metric">
          <span className="dp-metric__label">材料难度</span>
          <strong className="dp-metric__value">{materialDifficulty}</strong>
        </div>
        <div className="dp-metric dp-metric--accent">
          <span className="dp-metric__label">当前等级</span>
          <strong className="dp-metric__value">{userLevel}</strong>
        </div>
        <div className="dp-metric dp-metric--soft">
          <span className="dp-metric__label">建议目标</span>
          <strong className="dp-metric__value">{recommendedTargetLevel}</strong>
        </div>
      </div>

      {fitMessage && <p className="dp-fit">{fitMessage}</p>}

      {/* ── 目标等级 ── */}
      <div className="dp-section">
          <span className="dp-section__label">目标难度</span>
          <div className="dp-levels" role="radiogroup">
          {COLLINS_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={cn(
                "dp-level",
                selectedTargetLevel === level && "dp-level--active",
                recommendedTargetLevel === level && "dp-level--rec",
              )}
              onClick={() => onTargetLevelChange?.(level)}
              aria-pressed={selectedTargetLevel === level}
            >
              {level} 星
              {recommendedTargetLevel === level && <span className="dp-level__rec">推荐</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── 影响数字 ── */}
      <div className="dp-impact">
        <div className="dp-impact__item">
          <strong>{preservedI1Count}</strong>
          <span>保留词</span>
        </div>
        <div className="dp-impact__sep" />
        <div className="dp-impact__item dp-impact__item--warn">
          <strong>{aboveI1Count}</strong>
          <span>超纲词</span>
        </div>
        <div className="dp-impact__sep" />
        <div className="dp-impact__item">
          <strong>{simplificationImpactPercent}%</strong>
          <span>改写占比</span>
        </div>
      </div>

      {/* ── 难度分布色条（只保留色条，tooltip 显示数值）── */}
      <div className="dp-dist">
        {[...COLLINS_LEVELS, "unrated"].map((level) => {
          const count = levelCounts?.[String(level)] || levelCounts?.[level] || 0;
          const width = count > 0 ? Math.max((count / totalWords) * 100, 4) : 0;
          return width > 0 ? (
            <span
              key={level}
              className={cn("dp-dist__seg", `dp-dist__seg--${String(level).toLowerCase()}`)}
              style={{ width: `${width}%` }}
              title={level === "unrated" ? `未评级: ${count} 词` : `${level} 星: ${count} 词`}
            />
          ) : null;
        })}
      </div>

      {diagnosticError && (
        <p className="dp-error">{diagnosticError}</p>
      )}

      {/* ── 底部：预计 + 操作 ── */}
      <div className="dp-footer">
        <div className="dp-estimate">
          <span>{formatEstimateTime(estimatedSeconds)}</span>
          {estimatedChargeYuan !== null && (
            <span>¥{estimatedChargeYuan.toFixed(2)}</span>
          )}
        </div>
        <div className="dp-actions">
          <Button
            size="sm"
            className="dp-actions__primary"
            onClick={onContinueGeneration}
            disabled={isGenerating || isDiagnosing}
          >
            {isGenerating
              ? <Loader2 className="size-3.5 animate-spin" />
              : <WandSparkles className="size-3.5" />}
            生成课堂
          </Button>
          <Button size="sm" variant="outline" onClick={onRetryDiagnosis} disabled={isDiagnosing || isGenerating}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditAgain} disabled={isGenerating}>
            重新输入
          </Button>
        </div>
      </div>
    </aside>
  );
}


