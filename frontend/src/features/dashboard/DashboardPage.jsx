import { Skeleton } from "../../shared/ui";
import { useDashboardData } from "./useDashboardData";
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

export function DashboardPage({ apiCall, currentUser }) {
  const { stats, loading, error } = useDashboardData(apiCall);
  const userId = currentUser?.id;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-2">
        <h2 className="text-lg font-semibold">学习数据</h2>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-2">
        <h2 className="text-lg font-semibold">学习数据</h2>
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-2">
      <h2 className="text-lg font-semibold">学习数据</h2>

      {/* Stats cards */}
      <StatsCards stats={stats} />

      {/* AI Coach — hero section */}
      <AICoachCard apiCall={apiCall} stats={stats} userId={userId} />

      {/* Charts grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HeatmapChart dailyActivity={stats?.daily_activity} />
        <RadarChart skillScores={stats?.skill_scores} />
      </div>

      {/* Vocab growth */}
      <VocabGrowthChart vocabularyByLevel={stats?.vocabulary_by_level} />
    </div>
  );
}
