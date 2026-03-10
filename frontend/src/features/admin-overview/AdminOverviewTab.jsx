import { Activity, Gift, RefreshCcw, ScrollText, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ScrollArea, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

function parseError(data, fallback) {
  return `${data?.error_code || "ERROR"}: ${data?.message || fallback}`;
}

async function jsonOrEmpty(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

function MetricCard({ icon: Icon, label, value, hint }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-full border p-2 text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminOverviewTab({ apiCall }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [recentOperations, setRecentOperations] = useState([]);

  async function loadOverview() {
    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/overview");
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载总览失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setMetrics(data.metrics || null);
      setRecentBatches(Array.isArray(data.recent_batches) ? data.recent_batches : []);
      setRecentOperations(Array.isArray(data.recent_operations) ? data.recent_operations : []);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              管理台总览
            </CardTitle>
            <CardDescription>先看用户、点数、异常和兑换批次，再决定下一步处理哪一页。</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/ops?tab=system">去系统检查</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={loadOverview} disabled={loading}>
              <RefreshCcw className="size-4" />
              刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && !metrics
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[116px] w-full" />)
          : [
              { icon: Users, label: "今日新增账号", value: metrics?.today_new_users ?? 0, hint: "按北京时间今天统计" },
              { icon: Gift, label: "今日充值点数", value: `${metrics?.today_redeem_points ?? 0} 点`, hint: "只统计兑换码充值" },
              { icon: ScrollText, label: "今日消耗点数", value: `${metrics?.today_spent_points ?? 0} 点`, hint: "转写和翻译合计" },
              { icon: Sparkles, label: "近 24 小时翻译失败", value: metrics?.translation_failures_24h ?? 0, hint: "越高越需要排查翻译链路" },
              { icon: Activity, label: "近 24 小时异常", value: metrics?.incidents_24h ?? 0, hint: "包含翻译失败和兑换失败" },
              { icon: Gift, label: "当前有效批次", value: metrics?.active_batches ?? 0, hint: "仍可继续兑换的批次" },
            ].map((item) => <MetricCard key={item.label} {...item} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">最近批次活动</CardTitle>
              <CardDescription>快速看最近的兑换批次是否还在正常发放和过期。</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/redeem?tab=batches">查看批次</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full rounded-md border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>批次</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>面额</TableHead>
                    <TableHead>已兑 / 剩余</TableHead>
                    <TableHead>兑换率</TableHead>
                    <TableHead>过期时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBatches.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.batch_name}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "active" ? "default" : item.status === "expired" ? "secondary" : "outline"}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.face_value_points} 点</TableCell>
                      <TableCell>
                        {item.redeemed_count} / {item.remaining_count}
                      </TableCell>
                      <TableCell>{(Number(item.redeem_rate || 0) * 100).toFixed(1)}%</TableCell>
                      <TableCell>{formatDateTimeBeijing(item.expire_at)}</TableCell>
                    </TableRow>
                  ))}
                  {recentBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        暂无批次数据
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">最近管理员操作</CardTitle>
              <CardDescription>重点看计费、调账和兑换码状态变更等关键操作。</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/ops?tab=operations">查看操作日志</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full rounded-md border">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>操作员</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>对象</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOperations.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                      <TableCell>{item.operator_user_email || "-"}</TableCell>
                      <TableCell>{item.action_type}</TableCell>
                      <TableCell>{item.target_type} / {item.target_id || "-"}</TableCell>
                      <TableCell>{item.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {recentOperations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        暂无管理员操作记录
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
