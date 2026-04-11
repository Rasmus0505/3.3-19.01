import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui";

const LEVELS = [
  { min: 0, max: 0, color: "bg-muted" },
  { min: 1, max: 15, color: "bg-emerald-300/70 dark:bg-emerald-800" },
  { min: 16, max: 30, color: "bg-emerald-400 dark:bg-emerald-600" },
  { min: 31, max: 60, color: "bg-emerald-500 dark:bg-emerald-500" },
  { min: 61, max: Infinity, color: "bg-emerald-600 dark:bg-emerald-400" },
];

function getColorClass(minutes) {
  for (const level of LEVELS) {
    if (minutes >= level.min && minutes <= level.max) return level.color;
  }
  return LEVELS[0].color;
}

const WEEKDAY_LABELS = ["一", "三", "五"];

export function HeatmapChart({ dailyActivity = [] }) {
  const activityMap = {};
  for (const item of dailyActivity) {
    activityMap[item.date] = item.minutes || 0;
  }

  const today = new Date();
  const cells = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = (d.getDay() + 6) % 7;
    cells.push({ date: dateStr, minutes: activityMap[dateStr] || 0, row: dayOfWeek, index: 90 - i });
  }

  const weeks = [];
  let currentWeek = [];
  for (const cell of cells) {
    if (cell.row === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(cell);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const totalMinutes = dailyActivity.reduce((sum, d) => sum + (d.minutes || 0), 0);
  const activeDays = dailyActivity.filter((d) => d.minutes > 0).length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent" />
        <CardHeader className="relative pb-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-sm font-semibold">学习热力图</CardTitle>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span>{activeDays} 天活跃</span>
              <span>{Math.round(totalMinutes / 60)}h 累计</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="flex gap-[3px] overflow-x-auto pb-1">
            {/* Weekday labels */}
            <div className="mr-1 flex shrink-0 flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex h-[13px] w-5 items-center justify-end text-[9px] text-muted-foreground">
                  {i === 0 ? WEEKDAY_LABELS[0] : i === 2 ? WEEKDAY_LABELS[1] : i === 4 ? WEEKDAY_LABELS[2] : ""}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }, (_, row) => {
                  const cell = week.find((c) => c.row === row);
                  if (!cell) return <div key={row} className="h-[13px] w-[13px]" />;
                  return (
                    <motion.div
                      key={row}
                      className={`h-[13px] w-[13px] rounded-[3px] ${getColorClass(cell.minutes)}`}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: cell.index * 0.006,
                        type: "spring",
                        stiffness: 500,
                        damping: 25,
                      }}
                      whileHover={{
                        scale: 1.8,
                        zIndex: 10,
                        transition: { duration: 0.15 },
                      }}
                      title={`${cell.date}: ${cell.minutes} 分钟`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            <span>少</span>
            {LEVELS.map((level, i) => (
              <motion.div
                key={i}
                className={`h-[10px] w-[10px] rounded-[2px] ${level.color}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              />
            ))}
            <span>多</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
