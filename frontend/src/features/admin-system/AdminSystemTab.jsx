import { RefreshCcw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

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
  const { error, clearError, captureError } = useErrorHandler();

  async function loadSystem() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const [healthResp, healthReadyResp, billingRatesResp, overviewResp] = await Promise.all([
        apiCall("/health"),
        apiCall("/health/ready"),
        apiCall("/api/admin/billing-rates"),
        apiCall("/api/admin/overview"),
      ]);
      const healthData = await parseJsonSafely(healthResp);
      const healthReadyData = await parseJsonSafely(healthReadyResp);
      if (!healthResp.ok || !healthReadyResp.ok) {
        const formattedError = captureError(
          {
            code: "SYSTEM_CHECK_FAILED",
            message: `系统检查失败：/health=${healthResp.status} /health/ready=${healthReadyResp.status}`,
            details: {
              health: healthData,
              health_ready: healthReadyData,
              billing_rates_status: billingRatesResp.status,
              overview_status: overviewResp.status,
            },
            status: healthResp.status,
            statusText: healthResp.statusText,
            responseBody: {
              health: healthData,
              health_ready: healthReadyData,
            },
          },
          {
            context: {
              component: "AdminSystemTab",
              action: "加载系统检查",
              endpoint: "/health + /health/ready",
              method: "GET",
            },
          },
        );
        setStatus(formattedError.displayMessage);
      }
      setHealth(healthData);
      setHealthReady(healthReadyData);
      setBillingRatesOk(billingRatesResp.ok);
      setOverviewOk(overviewResp.ok);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminSystemTab",
          action: "加载系统检查",
          endpoint: "/health + /health/ready",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
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
              系统检查
            </CardTitle>
            <CardDescription>把服务、数据库和后台接口拆开看，能更快判断问题卡在哪一层。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadSystem} disabled={loading}>
            <RefreshCcw className="size-4" />
            重新检查
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loading && !health
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[124px] w-full" />)
          : [
              { label: "服务存活", ok: Boolean(health?.ok), hint: `service=${health?.service || "-"}` },
              { label: "数据库就绪", ok: Boolean(healthReady?.ok), hint: runtimeStatus.db_error || "数据库已准备好" },
              { label: "计费接口", ok: billingRatesOk, hint: billingRatesOk ? "后台计费接口可访问" : "后台计费接口不可访问" },
              { label: "总览接口", ok: overviewOk, hint: overviewOk ? "后台总览接口可访问" : "后台总览接口不可访问" },
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
          <CardTitle className="text-base">检查明细</CardTitle>
          <CardDescription>下面这张表会直接告诉你缺哪一项，方便在 Zeabur 里继续排查。</CardDescription>
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
                <TableCell>{runtimeStatus.db_error || "业务表和关键字段都已就绪"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>转写 Key</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.dashscope_configured)} readyLabel="已配置" failLabel="缺失" /></TableCell>
                <TableCell>DASHSCOPE_API_KEY {runtimeStatus.dashscope_configured ? "已可用" : "缺失会影响转写和翻译"}</TableCell>
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
                <TableCell>管理员初始化</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus.admin_bootstrap_ok)} readyLabel="成功" failLabel="失败" /></TableCell>
                <TableCell>{runtimeStatus.admin_bootstrap_error || "管理员初始账号已准备好"}</TableCell>
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

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
