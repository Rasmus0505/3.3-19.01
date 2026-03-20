import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Flame,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Sword,
  TrendingUp,
  Trophy,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { formatMoneyCents } from "../../shared/lib/money";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
  MetricChart,
  Progress,
} from "../../shared/ui";

const RANGE_OPTIONS = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
];

const CARD_ICONS = [Flame, Trophy, Sparkles, BookOpenCheck];
const TASK_STATUS_STYLES = {
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  todo: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  focus: "border-sky-500/30 bg-sky-500/10 text-sky-700",
};
const RISK_STYLES = {
  info: "border-sky-500/25 bg-sky-500/8",
  success: "border-emerald-500/25 bg-emerald-500/8",
  warning: "border-amber-500/30 bg-amber-500/10",
  danger: "border-rose-500/30 bg-rose-500/10",
};

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

function formatTaskStatus(status) {
  if (status === "done") return "已完成";
  if (status === "focus") return "高优先";
  return "待完成";
}

function handlePanelAction({ kind, lessonId, onStartLesson, onSwitchToUpload, onGoToHistory }) {
  if (kind === "resume-lesson" && lessonId) {
    onStartLesson?.(lessonId);
    return;
  }
  if (kind === "switch-upload") {
    onSwitchToUpload?.();
    return;
  }
  onGoToHistory?.();
}

function HeroCard({ hero, summary, loading }) {
  if (loading && !hero) {
    return <div className="h-[260px] animate-pulse rounded-[28px] border bg-muted/30" />;
  }
  if (!hero || !summary) return null;

  return (
    <Card className="overflow-hidden rounded-[30px] border-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.32),_transparent_28%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(88,28,135,0.88)_55%,_rgba(180,83,9,0.85))] text-white shadow-xl">
      <CardContent className="space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/20 bg-white/12 text-white">{hero.stage_label}</Badge>
              <Badge className="border-orange-200/30 bg-orange-200/12 text-orange-50">Lv.{hero.level}</Badge>
              <Badge className="border-white/20 bg-white/12 text-white/90">{hero.momentum_label}</Badge>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{hero.title}</h2>
              <p className="max-w-3xl text-sm leading-6 text-white/78 md:text-base">{hero.subtitle}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">成长值</p>
              <p className="mt-2 text-3xl font-semibold">{hero.growth_points}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">连续链</p>
              <p className="mt-2 text-3xl font-semibold">{hero.streak_days} 天</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/15 bg-black/12 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white/92">升级进度</p>
                <p className="text-xs text-white/60">距离下一阶段还差 {hero.points_to_next_level} 成长值</p>
              </div>
              <p className="text-sm text-white/78">{Math.round(hero.level_progress_percent)}%</p>
            </div>
            <Progress value={hero.level_progress_percent} className="mt-4 h-3 bg-white/10" />
          </div>
          <div className="rounded-[28px] border border-white/15 bg-black/12 p-4 backdrop-blur">
            <p className="text-sm font-medium text-white/92">当前状态</p>
            <p className="mt-2 text-sm leading-6 text-white/72">
              {summary.is_active_today ? "今天已经完成有效学习，可以继续冲刺额外成长值。" : "今天还没点亮成长链，先完成第一轮任务。"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskCard({ item, onAction }) {
  return (
    <Card className="rounded-[28px] border shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={TASK_STATUS_STYLES[item.status] || TASK_STATUS_STYLES.todo}>{formatTaskStatus(item.status)}</Badge>
              <Badge variant="outline">+{item.xp_reward} XP</Badge>
            </div>
            <h3 className="text-base font-semibold">{item.title}</h3>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl border bg-orange-500/10 text-orange-700">
            <Sword className="size-5" />
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
        <Button type="button" variant={item.status === "done" ? "outline" : "default"} onClick={onAction}>
          {item.action_label}
          <ChevronRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskCard({ item, onAction }) {
  return (
    <Card className={`rounded-[28px] border shadow-sm ${RISK_STYLES[item.severity] || RISK_STYLES.info}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-current/10 bg-background/80">
            {item.severity === "danger" ? <ShieldAlert className="size-5" /> : <AlertTriangle className="size-5" />}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.action_label}</p>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
        <Button type="button" variant="outline" onClick={onAction}>
          {item.action_label}
        </Button>
      </CardContent>
    </Card>
  );
}

function MilestoneCard({ item }) {
  return (
    <Card className={`rounded-[24px] border shadow-sm ${item.achieved ? "border-emerald-500/25 bg-emerald-500/7" : "bg-card"}`}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 flex size-10 items-center justify-center rounded-2xl border ${item.achieved ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-border bg-muted/40 text-muted-foreground"}`}>
          {item.achieved ? <CheckCircle2 className="size-5" /> : <Trophy className="size-5" />}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{item.label}</p>
          <p className="text-xs leading-5 text-muted-foreground">{item.value}</p>
        </div>
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
  const todayTasks = Array.isArray(payload?.today_tasks) ? payload.today_tasks : [];
  const riskCards = Array.isArray(payload?.risk_cards) ? payload.risk_cards : [];
  const milestones = Array.isArray(payload?.milestones) ? payload.milestones : [];
  const summary = payload?.summary || null;
  const hero = payload?.hero || null;
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
    const recentLearningText = summary.recent_learning_at ? `最近学习：${formatDateTime(summary.recent_learning_at)}` : "最近还没有新体系学习记录";
    return `${recentLearningText}，当前余额 ${formatMoneyCents(summary.balance_points ?? 0)}。`;
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
      <Card className="rounded-[28px] border shadow-sm">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="size-5" />
              学习成长面板
            </CardTitle>
            <CardDescription>先给今天最值得做的事，再告诉你节律、成长和风险变化。</CardDescription>
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

      <HeroCard hero={hero} summary={summary} loading={loading} />

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

      <Card className="rounded-[28px] border shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="size-4" />
            今日任务卡
          </CardTitle>
          <CardDescription>任务先于图表。先完成这些动作，再看趋势才有意义。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading && !payload ? (
            <div className="col-span-full rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">正在生成今日任务...</div>
          ) : todayTasks.length ? (
            todayTasks.map((item) => (
              <TaskCard
                key={item.key}
                item={item}
                onAction={() =>
                  handlePanelAction({
                    kind: item.action_kind,
                    lessonId: item.lesson_id,
                    onStartLesson,
                    onSwitchToUpload,
                    onGoToHistory,
                  })
                }
              />
            ))
          ) : (
            <div className="col-span-full rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">还没有可执行的今日任务。</div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4" />
            成长里程碑
          </CardTitle>
          <CardDescription>让成就感建立在真实节律和完课结果上。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {loading && !payload ? (
            <div className="col-span-full rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">正在计算成长里程碑...</div>
          ) : (
            milestones.map((item) => <MilestoneCard key={item.key} item={item} />)
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" />
            风险提醒
          </CardTitle>
          <CardDescription>这里不是吓唬你，而是尽早指出最容易打断长期学习的行为。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {loading && !payload ? (
            <div className="col-span-full rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">正在分析当前风险...</div>
          ) : (
            riskCards.map((item) => (
              <RiskCard
                key={item.key}
                item={item}
                onAction={() =>
                  handlePanelAction({
                    kind: item.lesson_id ? "resume-lesson" : "history",
                    lessonId: item.lesson_id,
                    onStartLesson,
                    onSwitchToUpload,
                    onGoToHistory,
                  })
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <MetricChart
        title={trendChart?.title || "成长趋势"}
        description={trendChart?.description || "看成长值和完成量是否同步增长。"}
        data={trendChart?.data || []}
        series={trendChart?.series || []}
        type={trendChart?.type || "area"}
        xKey={trendChart?.x_key || "label"}
        loading={loading && !payload}
      />

      <MetricChart
        title={statusChart?.title || "课程状态"}
        description={statusChart?.description || "优先关注进行中课程是否过多。"}
        data={statusChart?.data || []}
        series={statusChart?.series || []}
        type={statusChart?.type || "bar"}
        xKey={statusChart?.x_key || "label"}
        loading={loading && !payload}
      />

      <Card className="rounded-[28px] border shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">教练建议</CardTitle>
          <CardDescription>{coachHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !payload ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">正在生成教练建议...</div>
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
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">等你开始按新体系学习后，这里会出现更具体的建议。</div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
