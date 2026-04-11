import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui";

const LEVELS = [
  { min: 0, max: 0, cls: "bg-muted" },
  { min: 1, max: 15, cls: "bg-emerald-200 dark:bg-emerald-900" },
  { min: 16, max: 30, cls: "bg-emerald-400 dark:bg-emerald-700" },
  { min: 31, max: 60, cls: "bg-emerald-500 dark:bg-emerald-500" },
  { min: 61, max: Infinity, cls: "bg-emerald-700 dark:bg-emerald-300" },
];

function getColorClass(minutes) {
  for (const level of LEVELS) {
    if (minutes >= level.min && minutes <= level.max) return level.cls;
  }
  return LEVELS[0].cls;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export function HeatmapChart({ dailyActivity = [] }) {
  const activityMap = {};
  for (const item of dailyActivity) {
    activityMap[item.date] = item.minutes || 0;
  }

  // Build 13 weeks x 7 days grid (91 days)
  const today = new Date();
  const cells = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
    cells.push({ date: dateStr, minutes: activityMap[dateStr] || 0, row: dayOfWeek });
  }

  // Group into weeks (columns)
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

  return (
    <Card className="border-0 bg-gradient-to-br from-card to-muted/30 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">学习热力图</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-0.5 overflow-x-auto pb-1">
          {/* Weekday labels */}
          <div className="mr-1 flex shrink-0 flex-col gap-0.5">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} className="flex h-3 w-5 items-center justify-end text-[9px] text-muted-foreground">
                {i % 2 === 0 ? label : ""}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }, (_, row) => {
                const cell = week.find((c) => c.row === row);
                if (!cell) return <div key={row} className="h-3 w-3" />;
                return (
                  <div
                    key={row}
                    className={`h-3 w-3 rounded-[2px] transition-colors ${getColorClass(cell.minutes)}`}
                    title={`${cell.date}: ${cell.minutes} 分钟`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>少</span>
          {LEVELS.map((level, i) => (
            <div key={i} className={`h-2.5 w-2.5 rounded-[2px] ${level.cls}`} />
          ))}
          <span>多</span>
        </div>
      </CardContent>
    </Card>
  );
}
