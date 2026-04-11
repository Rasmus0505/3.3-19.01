import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui";

const LEVEL_CONFIG = [
  { level: "A1", color: "#60a5fa", label: "入门" },
  { level: "A2", color: "#3b82f6", label: "基础" },
  { level: "B1", color: "#22c55e", label: "中级" },
  { level: "B2", color: "#f97316", label: "中高级" },
  { level: "C1", color: "#a855f7", label: "高级" },
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="font-semibold">{item.level} · {item.label}</p>
      <p className="text-muted-foreground">{item.count} 词</p>
    </div>
  );
}

export function VocabGrowthChart({ vocabularyByLevel = {} }) {
  const data = LEVEL_CONFIG.map((cfg) => ({
    level: cfg.level,
    label: cfg.label,
    count: vocabularyByLevel[cfg.level] || 0,
    color: cfg.color,
  }));

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
        <CardHeader className="relative pb-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-sm font-semibold">词汇分布 (CEFR)</CardTitle>
            <span className="text-[11px] text-muted-foreground">共 {total} 词</span>
          </div>
        </CardHeader>
        <CardContent className="relative">
          {total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无生词本数据</p>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -15 }}>
                  <XAxis
                    dataKey="level"
                    tick={{ fontSize: 12, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.3)", radius: 6 }} />
                  <Bar
                    dataKey="count"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={52}
                    animationBegin={400}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  >
                    {data.map((entry) => (
                      <Cell key={entry.level} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Level legend */}
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {data.map((d) => (
                  <motion.div
                    key={d.level}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                    <span>{d.level}</span>
                    <span className="text-[10px]">({d.label})</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
