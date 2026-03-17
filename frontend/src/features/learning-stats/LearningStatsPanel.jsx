import {
  BookOpenCheck,
  CheckCircle2,
  Flame,
  Loader2,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, MetricCard, MetricChart } from "../../shared/ui";

const RANGE_OPTIONS = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
];

const CARD_ICONS = [Flame, CheckCircle2, Target, BookOpenCheck];

function formatDateTime(value) {
  if (!value) return "暂无";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (_) {
    return "暂无";
  }
}

function formatProgressPercent(value) {
  const safeValue = Number(value || 0);
  return `${Math.round(safeValue)}%`;
}

function DiagnosticLessonCard({ title, lesson, actionLabel, onAction }) {
  return (
    <Card className="rounded-3xl border shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {lesson
            ? `${lesson.completed_sentence_count}/${lesson.sentence_count} 句，当前进度 ${formatProgressPercent(lesson.progress_percent)}`
            : "当前没有匹配的课程。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lesson ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{lesson.title}</Badge>
              <Badge variant="secondary">最近记录：{formatDateTime(lesson.updated_at)}</Badge>
            </div>
            <Button type="button" variant="outline" onClick={() => onAction?.(lesson.lesson_id)}>
              {actionLabel}
            </Button>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">这里还没有需要处理的课程。</div>
        )}
      </CardContent>
    </Card>
  );
}

export function LearningStatsPanel({ accessToken, onStartLesson, onSwitchToUpload, onGoToHistory }) {
  const [rangeDays, setRangeDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const charts = Array.isArray(payload?.charts) ? payload.charts : [];
  const trendChart = charts[0] || null;
  const statusChart = charts[1] || null;
  const focusCards = Array.isArray(payload?.focus_cards) ? payload.focus_cards : [];
  const summary = payload?.summary || null;
  const recommendation = payload?.primary_recommendation || null;

  async function loadSummary(nextRangeDays = rangeDays, { background = false } = {}) {
    if (!accessToken) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const resp = await api(`/api/lessons/progress/summary?range_days=${nextRangeDays}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(data, "学习数据加载失败"));
      }
      setPayload(data);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadSummary(rangeDays);
  }, [accessToken, rangeDays]);

  const coachHint = useMemo(() => {
    if (!summary) return "";
    const recentLearningText = summary.recent_learning_at ? `最近学习：${formatDateTime(summary.recent_learning_at)}` : "最近还没有学习记录";
    return `${recentLearningText}，当前余额 ${Number(summary.balance_points || 0)} 点。`;
  }, [summary]);

  function handleRecommendationAction() {
    if (recommendation?.lesson_id) {
      onStartLesson?.(recommendation.lesson_id);
      return;
    }
    if (recommendation?.kind === "start-first-upload") {
      onSwitchToUpload?.();
      return;
    }
    onGoToHistory?.();
  }

  return (
    <section className="space-y-6">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="size-5" />
              学习数据
            </CardTitle>
            <CardDescription>用最近趋势、课程诊断和一条明确建议，帮你判断今天最值得继续的学习动作。</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={rangeDays === item.value ? "default" : "outline"}
                onClick={() => setRangeDays(item.value)}
              >
                {item.label}
              </Button>
            ))}
            <Button type="button" variant="outline" onClick={() => void loadSummary(rangeDays, { background: true })} disabled={refreshing}>
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>学习数据加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: Math.max(4, focusCards.length || 0) }, (_, index) => {
          const item = focusCards[index];
          return (
            <MetricCard
              key={item?.label || `learning-summary-card-${index}`}
              icon={CARD_ICONS[index] || Sparkles}
              label={item?.label || "学习指标"}
              value={item?.value || 0}
              hint={item?.hint || ""}
              tone={item?.tone || "default"}
              loading={loading && !payload}
            />
          );
        })}
      </div>

      <MetricChart
        title={trendChart?.title || "学习趋势"}
        description={trendChart?.description || "查看最近学习表现。"}
        data={trendChart?.data || []}
        series={trendChart?.series || []}
        type={trendChart?.type || "line"}
        xKey={trendChart?.x_key || "label"}
        loading={loading && !payload}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="xl:col-span-1">
          <MetricChart
            title={statusChart?.title || "课程状态分布"}
            description={statusChart?.description || "查看当前课程推进情况。"}
            data={statusChart?.data || []}
            series={statusChart?.series || []}
            type={statusChart?.type || "bar"}
            xKey={statusChart?.x_key || "label"}
            loading={loading && !payload}
          />
        </div>
        <DiagnosticLessonCard title="优先继续课程" lesson={payload?.continue_lesson || null} actionLabel="继续学习" onAction={onStartLesson} />
        <DiagnosticLessonCard title="停滞课程" lesson={payload?.stalled_lesson || null} actionLabel="回到这节课" onAction={onStartLesson} />
      </div>

      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">教练建议</CardTitle>
          <CardDescription>{coachHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !payload ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">学习建议生成中...</div>
          ) : recommendation ? (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{recommendation.title}</Badge>
                  <Badge variant="outline">{recommendation.kind}</Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{recommendation.description}</p>
              </div>
              <Button type="button" onClick={handleRecommendationAction}>
                {recommendation.kind === "start-first-upload" ? <UploadCloud className="size-4" /> : <TrendingUp className="size-4" />}
                {recommendation.action_label}
              </Button>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">等你开始学习后，这里会出现更具体的建议。</div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
