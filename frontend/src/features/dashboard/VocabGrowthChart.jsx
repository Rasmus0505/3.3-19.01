import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui";

const LEVEL_COLORS = {
  A1: "#93c5fd",
  A2: "#3b82f6",
  B1: "#22c55e",
  B2: "#f97316",
  C1: "#a855f7",
};

export function VocabGrowthChart({ vocabularyByLevel = {} }) {
  const data = Object.entries(LEVEL_COLORS).map(([level, color]) => ({
    level,
    count: vocabularyByLevel[level] || 0,
    color,
  }));

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="border-0 bg-gradient-to-br from-card to-muted/30 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-sm font-medium">词汇分布 (CEFR)</CardTitle>
          <span className="text-xs text-muted-foreground">共 {total} 词</span>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无生词本数据</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <XAxis dataKey="level" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                formatter={(value) => [`${value} 词`, "数量"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {data.map((entry) => (
                  <Cell key={entry.level} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
