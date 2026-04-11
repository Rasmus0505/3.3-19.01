import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Database, FlaskConical, Sparkles } from "lucide-react";
import { Badge, Button, Skeleton } from "../../shared/ui";
import { useDashboardData } from "./useDashboardData";
import { deriveBattleReport } from "./deriveBattleReport";
import { MOCK_STATS } from "./mockData";
import { AICoachCard } from "./AICoachCard";
import { HeatmapChart } from "./HeatmapChart";
import { RadarChart } from "./RadarChart";
import { VocabGrowthChart } from "./VocabGrowthChart";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[88px] rounded-[26px]" />
      <Skeleton className="h-[128px] rounded-[30px]" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[420px] rounded-[28px]" />
        <Skeleton className="h-[420px] rounded-[28px]" />
        <Skeleton className="h-[420px] rounded-[28px]" />
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: "easeOut" },
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
    <div className="mx-auto w-full max-w-[1480px] p-2 pb-6">
      <div className="rounded-[28px] border border-slate-200/80 bg-white/88 px-5 py-4 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.72)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-sky-700">
                i+1 EVIDENCE BOARD
              </Badge>
              <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-slate-600">
                单屏理论版
              </Badge>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg shadow-sky-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[28px] font-black tracking-tight text-slate-950">学习数据 · 可理解输入证据板</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{report.headerSummary}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="rounded-full border border-slate-200/80 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {report.predictedLevel}
            </div>
            <Button
              variant={useMock ? "default" : "outline"}
              size="sm"
              className={`rounded-full px-4 text-xs font-semibold ${useMock ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}`}
              onClick={toggleMock}
            >
              <Database className="mr-1.5 h-3.5 w-3.5" />
              {useMock ? "切回真实数据" : "切到演示数据"}
            </Button>
          </div>
        </div>
      </div>

      {showLoading ? <div className="mt-4"><DashboardSkeleton /></div> : null}

      {showError ? (
        <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700">
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
          <motion.div variants={itemVariants}>
            <AICoachCard apiCall={apiCall} stats={stats} report={report} userId={userId} useMock={useMock} />
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-4 xl:grid-cols-3">
            <RadarChart report={report} />
            <HeatmapChart report={report} />
            <VocabGrowthChart report={report} />
          </motion.div>

          <motion.div variants={itemVariants} className="flex items-center gap-2 rounded-[22px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm text-slate-600">
            <FlaskConical className="h-4 w-4 shrink-0 text-slate-500" />
            评分为理论代理指标，基于现有输入、完成、词汇和输出记录推导，用于证明“有效习得”而不是展示普通活跃度。
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  );
}
