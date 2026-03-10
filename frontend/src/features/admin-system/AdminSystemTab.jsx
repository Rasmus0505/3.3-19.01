import { RefreshCcw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

async function jsonOrEmpty(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

function StatusBadge({ ok, readyLabel = "正常", failLabel = "异常" }) {
  return <Badge variant={ok ? "default" : "destructive"}>{ok ? readyLabel : failLabel}</Badge>;
}

export function AdminSystemTab({ apiCall }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState(null);
  const [healthReady, setHealthReady] = useState(null);
  const [billingRatesOk, setBillingRatesOk] = useState(false);
  const [overviewOk, setOverviewOk] = useState(false);

  async function loadSystem() {
    setLoading(true);
    setStatus("");
    try {
      const [healthResp, healthReadyResp, billingRatesResp, overviewResp] = await Promise.all([
        apiCall("/health"),
        apiCall("/health/ready"),
        apiCall("/api/admin/billing-rates"),
        apiCall("/api/admin/overview"),
      ]);
      const healthData = await jsonOrEmpty(healthResp);
      const healthReadyData = await jsonOrEmpty(healthReadyResp);
      if (!healthResp.ok || !healthReadyResp.ok) {
        const message = `健康检查失败：/health=${healthResp.status} /health/ready=${healthReadyResp.status}`;
        setStatus(message);
        toast.error(message);
      }
      setHealth(healthData);
      setHealthReady(healthReadyData);
      setBillingRatesOk(billingRatesResp.ok);
      setOverviewOk(overviewResp.ok);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSystem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runtimeStatus = healthReady?.status || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="size-4" />
              系统状态
            </CardTitle>
            <CardDescription>把“服务活着”“数据库就绪”“后台接口可达”拆开看，定位问题更快。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadSystem} disabled={loading}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loading && !health
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[124px] w-full" />)
          : [
              { label: "/health", ok: Boolean(health?.ok), hint: `service=${health?.service || "-"}` },
              { label: "/health/ready", ok: Boolean(healthReady?.ok), hint: runtimeStatus.db_error || "数据库已就绪" },
              { label: "后台计费接口", ok: billingRatesOk, hint: billingRatesOk ? "GET /api/admin/billing-rates 可达" : "后台 API 不可达" },
              { label: "后台总览接口", ok: overviewOk, hint: overviewOk ? "GET /api/admin/overview 可达" : "总览 API 不可达" },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="space-y-2 p-5">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <StatusBadge ok={item.ok} />
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{item.hint}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">运行时详情</CardTitle>
          <CardDescription>来自 `/health/ready` 的运行状态，方便在 Zeabur 上直接判断缺哪一环。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>数据库</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.db_ready)} readyLabel="已就绪" failLabel="未就绪" /></TableCell>
                <TableCell>{runtimeStatus.db_error || "业务表与关键字段齐全"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>DashScope Key</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.dashscope_configured)} readyLabel="已配置" failLabel="缺失" /></TableCell>
                <TableCell>DASHSCOPE_API_KEY {runtimeStatus.dashscope_configured ? "已可用" : "缺失会影响转写/翻译能力"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>ffmpeg</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.ffmpeg_ready)} readyLabel="已就绪" failLabel="不可用" /></TableCell>
                <TableCell>{runtimeStatus.media_detail || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>ffprobe</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.ffprobe_ready)} readyLabel="已就绪" failLabel="不可用" /></TableCell>
                <TableCell>{runtimeStatus.media_detail || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>管理员引导</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.admin_bootstrap_ok)} readyLabel="成功" failLabel="失败" /></TableCell>
                <TableCell>{runtimeStatus.admin_bootstrap_error || "管理员初始账号引导成功"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>最近检查时间</TableCell>
                <TableCell>{runtimeStatus.checked_at ? "已记录" : "未记录"}</TableCell>
                <TableCell>{runtimeStatus.checked_at ? formatDateTimeBeijing(runtimeStatus.checked_at) : "-"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
