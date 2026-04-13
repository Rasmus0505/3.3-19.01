import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Skeleton } from "./skeleton";

const DEFAULT_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function hasPositiveChartSize(size) {
  return size.width > 0 && size.height > 0;
}

function renderSeries(type, series) {
  return series.map((item, index) => {
    const common = {
      key: item.key,
      dataKey: item.key,
      name: item.name,
      stroke: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      fill: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    };

    if (type === "bar") {
      return <Bar key={item.key} {...common} radius={[8, 8, 0, 0]} fillOpacity={0.9} />;
    }
    if (type === "area") {
      return <Area key={item.key} {...common} type="monotone" fillOpacity={0.14} strokeWidth={2} />;
    }
    return <Line key={item.key} {...common} type="monotone" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />;
  });
}

export function MetricChart({
  title,
  description,
  data = [],
  series = [],
  type = "line",
  xKey = "label",
  height = 280,
  loading = false,
  emptyText = "当前条件下暂无图表数据",
  className,
}) {
  const ChartComponent = type === "bar" ? BarChart : type === "area" ? AreaChart : LineChart;
  const chartContainerRef = useRef(null);
  const waitForVisibleLogRef = useRef(false);
  const [chartContainerSize, setChartContainerSize] = useState(() => ({
    width: 0,
    height: Math.max(0, Number(height) || 0),
  }));

  useEffect(() => {
    const element = chartContainerRef.current;
    if (!element) return undefined;

    function updateChartContainerSize() {
      const nextSize = {
        width: Math.round(element.clientWidth || 0),
        height: Math.round(element.clientHeight || Number(height) || 0),
      };

      setChartContainerSize((currentSize) =>
        currentSize.width === nextSize.width && currentSize.height === nextSize.height ? currentSize : nextSize,
      );

      if (!data.length) return;

      if (hasPositiveChartSize(nextSize)) {
        if (waitForVisibleLogRef.current) {
          console.debug("[DEBUG] metric chart container ready", { title, ...nextSize });
          waitForVisibleLogRef.current = false;
        }
        return;
      }

      if (!waitForVisibleLogRef.current) {
        console.debug("[DEBUG] metric chart waiting for visible container", { title, ...nextSize });
        waitForVisibleLogRef.current = true;
      }
    }

    updateChartContainerSize();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateChartContainerSize();
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [data.length, height, title]);

  const chartReady = hasPositiveChartSize(chartContainerSize);

  return (
    <Card className={cn("rounded-3xl border shadow-sm", className)}>
      {(title || description) && (
        <CardHeader className="space-y-1">
          {title ? <CardTitle className="text-base">{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      )}
      <CardContent>
        {loading ? (
          <Skeleton className="w-full rounded-2xl" style={{ height }} />
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-4 text-sm text-muted-foreground" style={{ height }}>
            {emptyText}
          </div>
        ) : (
          <div ref={chartContainerRef} className="min-w-0" style={{ height }}>
            {chartReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <ChartComponent data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={42} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {renderSeries(type, series)}
                </ChartComponent>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-4 text-sm text-muted-foreground">
                图表布局准备中...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
