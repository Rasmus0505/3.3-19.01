import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Database, Sparkles } from "lucide-react";
import { Button, Skeleton } from "../../shared/ui";
import { useDashboardData } from "./useDashboardData";
import { MOCK_STATS } from "./mockData";
import { StatsCards } from "./StatsCards";
import { AICoachCard } from "./AICoachCard";
import { HeatmapChart } from "./HeatmapChart";
import { RadarChart } from "./RadarChart";
import { VocabGrowthChart } from "./VocabGrowthChart";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[140px] rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-xl" />
        <Skeleton className="h-[260px] rounded-xl" />
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 32, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 24 },
  },
};

export function DashboardPage({ apiCall, currentUser }) {
  const { stats: realStats, loading, error } = useDashboardData(apiCall);
  const userId = currentUser?.id;
  const [useMock, setUseMock] = useState(false);

  const stats = useMock ? MOCK_STATS : realStats;

  const toggleMock = useCallback(() => setUseMock((prev) => !prev), []);

  // Determine what to show — mock mode always shows data immediately
  const showLoading = !useMock && loading;
  const showError = !useMock && !loading && error;
  const showData = useMock || (!loading && !error && stats);

  return (
    <div className="mx-auto max-w-5xl p-2 pb-12">
      {/* Hero header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">学习数据</h2>
            <p className="text-xs text-muted-foreground">AI-Powered Learning Analytics</p>
          </div>
        </div>

        <Button
          variant={useMock ? "default" : "outline"}
          size="sm"
          className="gap-2 text-xs"
          onClick={toggleMock}
        >
          <Database className="h-3.5 w-3.5" />
          {useMock ? "查看真实数据" : "预览演示数据"}
        </Button>
      </div>

      {/* Mock data banner */}
      {useMock && (
        <div className="mb-6">
          <div className="rounded-xl border border-amber-200/50 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
            <span className="font-medium">演示模式</span> — 当前显示的是预设示例数据，非真实学习记录
          </div>
        </div>
      )}

      {/* Loading */}
      {showLoading && <DashboardSkeleton />}

      {/* Error */}
      {showError && (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Dashboard content */}
      {showData && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <motion.div variants={itemVariants}>
            <StatsCards stats={stats} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <AICoachCard apiCall={apiCall} stats={stats} userId={userId} useMock={useMock} />
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-2">
            <HeatmapChart dailyActivity={stats?.daily_activity} />
            <RadarChart skillScores={stats?.skill_scores} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <VocabGrowthChart vocabularyByLevel={stats?.vocabulary_by_level} />
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
