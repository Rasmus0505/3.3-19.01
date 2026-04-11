import { BookOpen, BookOpenText, Clock, Flame, Languages, Mic2 } from "lucide-react";
import { Card, CardContent } from "../../shared/ui";

const STAT_ITEMS = [
  { key: "total_lessons", label: "听力课程", icon: BookOpen, color: "text-blue-500", format: (v) => v },
  { key: "total_reading_packs", label: "阅读材料", icon: BookOpenText, color: "text-emerald-500", format: (v) => v },
  { key: "total_study_minutes", label: "学习时长", icon: Clock, color: "text-amber-500", format: (v) => `${v} 分钟` },
  { key: "streak_days", label: "连续打卡", icon: Flame, color: "text-red-500", format: (v) => `${v} 天` },
  { key: "vocabulary_count", label: "掌握词汇", icon: Languages, color: "text-violet-500", format: (v) => v },
  { key: "avg_soe_score", label: "口语均分", icon: Mic2, color: "text-pink-500", format: (v) => (v > 0 ? v.toFixed(1) : "--") },
];

export function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {STAT_ITEMS.map((item, i) => {
        const Icon = item.icon;
        const value = stats?.[item.key] ?? 0;
        return (
          <Card
            key={item.key}
            className="group relative overflow-hidden border-0 bg-gradient-to-br from-card to-muted/30 shadow-sm transition-all hover:shadow-md"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <CardContent className="flex flex-col items-center gap-1.5 p-4 text-center">
              <div className={`rounded-xl bg-background p-2 shadow-sm ${item.color}`}>
                <Icon className="size-5" />
              </div>
              <p className="text-2xl font-bold tracking-tight">{item.format(value)}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
