import { Activity, ArrowRight, Gift, RefreshCcw, ScrollText, Shield, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { formatMoneyCents } from "../../shared/lib/money";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, MetricCard, MetricChart, ResponsiveTable } from "../../shared/ui";

function toneForCard(label) {
  if (label.includes("异常")) return "danger";
  if (label.includes("充值")) return "success";
  if (label.includes("消耗")) return "warning";
  if (label.includes("新增")) return "info";
  return "default";
}

function trendFromChart(charts, key, fallbackValue) {
  const trendChart = charts.find((item) => item.title?.includes("核心趋势"));
  const points = Array.isArray(trendChart?.data) ? trendChart.data : [];
  if (points.length < 2) return { value: fallbackValue, direction: "flat" };
  const latest = Number(points.at(-1)?.[key] || 0);
  const previous = Number(points.at(-2)?.[key] || 0);
  const diff = latest - previous;
  return { value: `${diff >= 0 ? "+" : ""}${diff}`, direction: diff === 0 ? "flat" : diff > 0 ? "up" : "down" };
}

export function AdminOverviewTab({ apiCall }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [recentOperations, setRecentOperations] = useState([]);
  const [summaryCards, setSummaryCards] = useState([]);
  const [charts, setCharts] = useState([]);
  const { error, clearError, captureError } = useErrorHandler();

  async function loadOverview() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/overview");
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminOverviewTab",
            action: "加载总览",
            endpoint: "/api/admin/overview",
            method: "GET",
            fallbackMessage: "加载总览失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setMetrics(data.metrics || null);
      setRecentBatches(Array.isArray(data.recent_batches) ? data.recent_batches : []);
      setRecentOperations(Array.isArray(data.recent_operations) ? data.recent_operations : []);
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
      setCharts(Array.isArray(data.charts) ? data.charts : []);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminOverviewTab",
          action: "加载总览",
          endpoint: "/api/admin/overview",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metricCards = useMemo(() => {
    const list = [
      { icon: Users, label: "今日新增账号", value: metrics?.today_new_users ?? 0, hint: "按北京时间今天统计", key: "新增账号" },
      { icon: Gift, label: "今日充值金额", value: formatMoneyCents(metrics?.today_redeem_points ?? 0), hint: "只统计兑换码充值", key: "充值点数" },
      { icon: ScrollText, label: "今日消耗金额", value: formatMoneyCents(metrics?.today_spent_points ?? 0), hint: "转写和翻译合计", key: "消耗点数" },
      { icon: Sparkles, label: "近 24 小时翻译失败", value: metrics?.translation_failures_24h ?? 0, hint: "越高越需要排查翻译链路", key: "异常数" },
      { icon: Activity, label: "近 24 小时异常", value: metrics?.incidents_24h ?? 0, hint: "包含翻译失败和兑换失败", key: "异常数" },
      { icon: Gift, label: "当前有效批次", value: metrics?.active_batches ?? 0, hint: "仍可继续兑换的批次", key: "新增账号" },
    ];
    return list.map((item) => ({
      ...item,
      tone: toneForCard(item.label),
      trend: trendFromChart(charts, item.key, "0"),
    }));
  }, [charts, metrics]);

  const batchColumns = useMemo(
    () => [
      { key: "batch", header: "批次", mobileLabel: "批次", render: (item) => item.batch_name },
      {
        key: "status",
        header: "状态",
        mobileLabel: "状态",
        render: (item) => (
          <Badge variant={item.status === "active" ? "default" : item.status === "expired" ? "secondary" : "outline"}>{item.status}</Badge>
        ),
      },
      { key: "points", header: "面额", mobileLabel: "面额", render: (item) => formatMoneyCents(item.face_value_amount_cents ?? item.face_value_points ?? 0) },
      { key: "redeemed", header: "已兑 / 剩余", mobileLabel: "已兑 / 剩余", render: (item) => `${item.redeemed_count} / ${item.remaining_count}` },
      { key: "rate", header: "兑换率", mobileLabel: "兑换率", render: (item) => `${(Number(item.redeem_rate || 0) * 100).toFixed(1)}%` },
      { key: "expire", header: "过期时间", mobileLabel: "过期", render: (item) => formatDateTimeBeijing(item.expire_at) },
    ],
    [],
  );

  const operationColumns = useMemo(
    () => [
      { key: "time", header: "时间", mobileLabel: "时间", render: (item) => formatDateTimeBeijing(item.created_at) },
      { key: "operator", header: "操作员", mobileLabel: "操作员", render: (item) => item.operator_user_email || "-" },
      { key: "action", header: "动作", mobileLabel: "动作", render: (item) => <Badge variant="outline">{item.action_type}</Badge> },
      { key: "target", header: "对象", mobileLabel: "对象", render: (item) => `${item.target_type} / ${item.target_id || "-"}` },
      { key: "note", header: "备注", mobileLabel: "备注", render: (item) => item.note || "-" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Shield className="size-3.5" />
              运营总览
            </div>
            <div>
              <CardTitle className="text-lg">先看健康、趋势和快捷入口，再决定下一步处理哪条链路</CardTitle>
              <CardDescription>本页把新增、金额、异常、批次和后台关键动作聚在一起，适合做每日巡检和异常分派。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/troubleshooting?tab=health&panel=system">
                去系统检查
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/troubleshooting?tab=tasks&panel=task-failures">去生成失败</Link>
            </Button>
            <Button size="sm" onClick={loadOverview} disabled={loading}>
              <RefreshCcw className="size-4" />
              刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(summaryCards.length > 0 ? summaryCards : metricCards.slice(0, 4)).map((item) => (
          <MetricCard
            key={item.label}
            icon={item.label.includes("账号") ? Users : item.label.includes("充值") ? Gift : item.label.includes("消耗") ? ScrollText : Activity}
            label={item.label}
            value={String(item.label || "").includes("金额") ? formatMoneyCents(item.value) : item.value}
            hint={item.hint}
            tone={item.tone || toneForCard(item.label)}
            loading={loading && !metrics}
          />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((item) => (
          <MetricCard key={item.label} {...item} loading={loading && !metrics} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {(charts.length > 0 ? charts : []).map((chart) => (
          <MetricChart
            key={chart.title}
            title={chart.title}
            description={chart.description}
            data={chart.data}
            series={chart.series}
            type={chart.type}
            xKey={chart.x_key}
            loading={loading && charts.length === 0}
            className={chart.title?.includes("核心趋势") ? "xl:col-span-2" : ""}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-3xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">最近批次活动</CardTitle>
              <CardDescription>快速看最近的兑换批次是否还在正常发放和过期。</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/redeem?panel=batches">查看批次</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              columns={batchColumns}
              data={recentBatches}
              getRowKey={(item) => item.id}
              mobileTitle={(item) => item.batch_name}
              mobileDescription={(item) => `${formatMoneyCents(item.face_value_amount_cents ?? item.face_value_points ?? 0)} · ${item.status}`}
              mobileFooter={(item) => `过期：${formatDateTimeBeijing(item.expire_at)}`}
              emptyText="暂无批次数据"
              minWidth={720}
              loading={loading && recentBatches.length === 0}
            />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">最近管理员操作</CardTitle>
              <CardDescription>重点看计费、调账和兑换码状态变更等关键操作。</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/troubleshooting?tab=operations&panel=operations">查看操作日志</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              columns={operationColumns}
              data={recentOperations}
              getRowKey={(item) => item.id}
              mobileTitle={(item) => item.action_type}
              mobileDescription={(item) => item.operator_user_email || "未知操作员"}
              mobileFooter={(item) => item.note || "暂无备注"}
              emptyText="暂无管理员操作记录"
              minWidth={760}
              loading={loading && recentOperations.length === 0}
            />
          </CardContent>
        </Card>
      </div>

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <Card className="rounded-3xl border border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{status}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
