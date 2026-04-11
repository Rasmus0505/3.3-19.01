import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Database, Orbit, Sparkles } from "lucide-react";
import { Badge, Button, Skeleton } from "../../shared/ui";
import { useDashboardData } from "./useDashboardData";
import { deriveBattleReport } from "./deriveBattleReport";
import { MOCK_STATS } from "./mockData";
import { StatsCards } from "./StatsCards";
import { AICoachCard } from "./AICoachCard";
import { HeatmapChart } from "./HeatmapChart";
import { RadarChart } from "./RadarChart";
import { VocabGrowthChart } from "./VocabGrowthChart";
import { SignalPanel } from "./SignalPanel";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[220px] rounded-[32px]" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_400px]">
        <Skeleton className="h-[380px] rounded-[32px]" />
        <Skeleton className="h-[380px] rounded-[32px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
        <Skeleton className="h-[320px] rounded-[30px]" />
        <div className="grid gap-4">
          <Skeleton className="h-[188px] rounded-[30px]" />
          <Skeleton className="h-[188px] rounded-[30px]" />
        </div>
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: "easeOut" },
  },
};

export function DashboardPage({ apiCall, currentUser }) {
  const { stats: realStats, loading, error } = useDashboardData(apiCall);
  const userId = currentUser?.id;
  const [useMock, setUseMock] = useState(true);

  const stats = useMock ? MOCK_STATS : realStats;
  const report = deriveBattleReport(stats);

  const toggleMock = useCallback(() => setUseMock((previous) => !previous), []);

  const showLoading = !useMock && loading;
  const showError = !useMock && !loading && error;
  const showData = useMock || (!loading && !error && stats);

  return (
    <div className="mx-auto w-full max-w-[1500px] p-2 pb-8">
      <div className="relative overflow-hidden rounded-[36px] border border-white/55 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(240,249,255,0.92))] p-5 shadow-[0_40px_120px_-68px_rgba(15,23,42,0.7)] backdrop-blur-xl lg:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.88),rgba(239,246,255,0.78))]" />
        <div className="absolute inset-y-0 right-8 w-px bg-gradient-to-b from-transparent via-slate-200/80 to-transparent" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-cyan-200/70 bg-cyan-50 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-cyan-700">
                  AI LEARNING WAR ROOM
                </Badge>
                <Badge className="rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-slate-600">
                  单屏竞赛版
                </Badge>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xl shadow-cyan-500/25">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-[30px] font-black tracking-tight text-slate-950 lg:text-[36px]">学习数据 · AI 战报舱</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 lg:text-[15px]">
                    {report.heroSummary}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:max-w-[320px] xl:justify-end">
              <div className="rounded-full border border-white/70 bg-white/85 px-4 py-2 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Stage</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-950">
                  <Orbit className="h-3.5 w-3.5 text-cyan-500" />
                  {report.stage.label}
                </p>
              </div>
              <Button
                variant={useMock ? "default" : "outline"}
                size="sm"
                className={`rounded-full px-4 text-xs font-semibold shadow-sm ${useMock ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white/85"}`}
                onClick={toggleMock}
              >
                <Database className="mr-1.5 h-3.5 w-3.5" />
                {useMock ? "切回真实数据" : "切到演示战报"}
              </Button>
            </div>
          </div>

          {useMock ? (
            <div className="relative rounded-[24px] border border-amber-200/60 bg-amber-50/90 px-4 py-3 text-sm text-amber-800">
              当前使用预设竞赛数据，适合截图演示。切回真实数据后会立即恢复后端返回的统计和 AI 文案状态。
            </div>
          ) : null}

          <StatsCards items={report.heroMetrics} />
        </div>
      </div>

      {showLoading ? <div className="mt-4"><DashboardSkeleton /></div> : null}

      {showError ? (
        <div className="mt-4 rounded-[28px] border border-rose-200 bg-rose-50/90 px-6 py-5 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {showData ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mt-4 space-y-4"
        >
          <motion.div variants={itemVariants} className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_400px]">
            <AICoachCard apiCall={apiCall} stats={stats} report={report} userId={userId} useMock={useMock} />
            <SignalPanel report={report} />
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
            <HeatmapChart report={report} />
            <div className="grid gap-4">
              <RadarChart report={report} />
              <VocabGrowthChart report={report} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  );
}
