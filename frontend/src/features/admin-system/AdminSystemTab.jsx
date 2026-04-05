import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui";

function StatusBadge({ ok, readyLabel = "正常", failLabel = "异常" }) {
  return <Badge variant={ok ? "default" : "destructive"}>{ok ? readyLabel : failLabel}</Badge>;
}

function runtimeStatusMeta(item = {}) {
  const status = String(item.status || "").trim().toLowerCase();
  if (status === "ready") return { label: "已就绪", variant: "default" };
  if (status === "preparing") return { label: "准备中", variant: "secondary" };
  if (status === "missing") return { label: "缺失", variant: "secondary" };
  if (status === "unsupported") return { label: "不支持", variant: "outline" };
  return { label: "异常", variant: "destructive" };
}

export function AdminSystemTab({ apiCall, snapshot, loading = false, status = "", error = null }) {
  const [localSnapshot, setLocalSnapshot] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const [runtimeReadiness, setRuntimeReadiness] = useState([]);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const { error: localError, clearError, captureError } = useErrorHandler();

  const effectiveSnapshot = snapshot ?? localSnapshot;
  const effectiveLoading = Boolean(loading || localLoading);
  const effectiveStatus = status || localStatus || runtimeStatus;
  const effectiveError = error || localError;
  const readyStatus = effectiveSnapshot?.ready?.data?.status || {};

  async function loadDiagnostics({ includeHealthSnapshot }) {
    if (typeof apiCall !== "function") return;
    setRuntimeLoading(true);
    setRuntimeStatus("");
    clearError();
    if (includeHealthSnapshot) {
      setLocalLoading(true);
      setLocalStatus("");
    }
    try {
      const requests = includeHealthSnapshot
        ? [apiCall("/health"), apiCall("/health/ready"), apiCall("/api/admin/runtime-readiness")]
        : [apiCall("/api/admin/runtime-readiness")];
      const responses = await Promise.all(requests);
      if (includeHealthSnapshot) {
        const [healthResp, readyResp, runtimeResp] = responses;
        const [healthData, readyData, runtimeData] = await Promise.all(
          responses.map((response) => parseJsonSafely(response)),
        );
        setLocalSnapshot({
          health: { ok: healthResp.ok, status: healthResp.status, data: healthData },
          ready: { ok: readyResp.ok, status: readyResp.status, data: readyData },
        });
        if (!runtimeResp.ok) {
          const formattedError = captureError(
            formatResponseError(runtimeResp, runtimeData, {
              component: "AdminSystemTab",
              action: "加载 Unlock Anything 运行就绪度",
              endpoint: "/api/admin/runtime-readiness",
              method: "GET",
              fallbackMessage: "加载 Unlock Anything 运行就绪度失败",
            }),
            { toast: false },
          );
          setRuntimeStatus(formattedError.displayMessage);
          setRuntimeReadiness([]);
          return;
        }
        setRuntimeReadiness(Array.isArray(runtimeData?.items) ? runtimeData.items : []);
        return;
      }
      const [runtimeResp] = responses;
      const runtimeData = await parseJsonSafely(runtimeResp);
      if (!runtimeResp.ok) {
        const formattedError = captureError(
          formatResponseError(runtimeResp, runtimeData, {
            component: "AdminSystemTab",
            action: "加载 Unlock Anything 运行就绪度",
            endpoint: "/api/admin/runtime-readiness",
            method: "GET",
            fallbackMessage: "加载 Unlock Anything 运行就绪度失败",
          }),
          { toast: false },
        );
        setRuntimeStatus(formattedError.displayMessage);
        setRuntimeReadiness([]);
        return;
      }
      setRuntimeReadiness(Array.isArray(runtimeData?.items) ? runtimeData.items : []);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSystemTab",
          action: includeHealthSnapshot ? "加载系统诊断" : "加载 Bottle 运行就绪度",
          endpoint: includeHealthSnapshot ? "/health + /health/ready + /api/admin/runtime-readiness" : "/api/admin/runtime-readiness",
          method: "GET",
        }),
        { toast: false },
      );
      if (includeHealthSnapshot) {
        setLocalStatus(formattedError.displayMessage);
      } else {
        setRuntimeStatus(formattedError.displayMessage);
      }
    } finally {
      if (includeHealthSnapshot) {
        setLocalLoading(false);
      }
      setRuntimeLoading(false);
    }
  }

  useEffect(() => {
    if (typeof apiCall !== "function") return;
    void loadDiagnostics({ includeHealthSnapshot: !snapshot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiCall, snapshot]);

  const rows = [
    {
      item: "/health",
      ok: Boolean(effectiveSnapshot?.health?.ok),
      readyLabel: "200",
      failLabel: "失败",
      detail: `${effectiveSnapshot?.health?.status || "-"} · ${effectiveSnapshot?.health?.data?.service || "-"}`,
    },
    {
      item: "/health/ready",
      ok: Boolean(effectiveSnapshot?.ready?.ok),
      readyLabel: "已就绪",
      failLabel: "未就绪",
      detail: readyStatus?.db_error || "数据库与关键字段检查通过",
    },
    {
      item: "管理员初始化",
      ok: Boolean(readyStatus?.admin_bootstrap_ok),
      readyLabel: "成功",
      failLabel: "失败",
      detail: readyStatus?.admin_bootstrap_error || "管理员账号初始化正常",
    },
    {
      item: "DASHSCOPE_API_KEY",
      ok: Boolean(readyStatus?.dashscope_configured),
      readyLabel: "已配置",
      failLabel: "缺失",
      detail: "缺失会影响转写和翻译调用",
    },
    {
      item: "ffmpeg / ffprobe",
      ok: Boolean(readyStatus?.ffmpeg_ready && readyStatus?.ffprobe_ready),
      readyLabel: "已就绪",
      failLabel: "异常",
      detail: readyStatus?.media_detail || "-",
    },
    {
      item: "最近检查时间",
      ok: Boolean(readyStatus?.checked_at),
      readyLabel: "已记录",
      failLabel: "未记录",
      detail: formatDateTimeBeijing(readyStatus?.checked_at) || "-",
    },
  ];
  const runtimeCards = useMemo(() => (Array.isArray(runtimeReadiness) ? runtimeReadiness : []), [runtimeReadiness]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-base">接口状态快照</CardTitle>
            <CardDescription>直接看服务、数据库、管理员初始化和关键运行依赖，先确认系统底层有没有通。</CardDescription>
          </div>
          {typeof apiCall === "function" ? (
            <Button variant="outline" size="sm" onClick={() => void loadDiagnostics({ includeHealthSnapshot: !snapshot })} disabled={effectiveLoading || runtimeLoading}>
              <RefreshCcw className="size-4" />
              重新诊断
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>检查项</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {effectiveLoading && !effectiveSnapshot
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <TableRow key={row.item}>
                      <TableCell>{row.item}</TableCell>
                      <TableCell>
                        <StatusBadge ok={row.ok} readyLabel={row.readyLabel} failLabel={row.failLabel} />
                      </TableCell>
                      <TableCell>{row.detail}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unlock Anything 运行就绪度</CardTitle>
          <CardDescription>只读展示 Unlock Anything 1.0 和 Unlock Anything 2.0 的运行状态、可用性和诊断提示，不在这里暴露任何运行参数。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {runtimeLoading && runtimeCards.length === 0
              ? Array.from({ length: 2 }).map((_, index) => (
                  <Card key={index} className="border-dashed shadow-none">
                    <CardHeader>
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-4 w-20" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))
              : runtimeCards.map((item) => {
                  const meta = runtimeStatusMeta(item);
                  return (
                    <Card key={item.model_key} className="border-dashed shadow-none">
                      <CardHeader className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle className="text-base">{item.display_name}</CardTitle>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </div>
                        <CardDescription>{item.runtime_kind === "desktop_local" ? "本地运行时诊断" : "云端接口诊断"}</CardDescription>
                        <p className="text-xs text-muted-foreground">技术标识：{item.model_key}</p>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <div>{item.message || "未返回运行说明。"}</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={item.available ? "default" : "outline"}>{item.available ? "可用" : "不可用"}</Badge>
                          {(Array.isArray(item.actions) ? item.actions : []).map((action) => (
                            <Badge key={`${item.model_key}-${action.key || action.label}`} variant="secondary">
                              {action.label || action.key}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </CardContent>
      </Card>

      {effectiveError ? (
        <AdminErrorNotice error={effectiveError} />
      ) : effectiveStatus ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>{effectiveStatus}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
