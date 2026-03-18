import { AlertTriangle } from "lucide-react";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import {
  Alert,
  AlertDescription,
  Badge,
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

export function AdminSystemTab({ snapshot, loading, status, error }) {
  const runtimeStatus = snapshot?.ready?.data?.status || {};
  const rows = [
    {
      item: "/health",
      ok: Boolean(snapshot?.health?.ok),
      readyLabel: "200",
      failLabel: "失败",
      detail: `${snapshot?.health?.status || "-"} · ${snapshot?.health?.data?.service || "-"}`,
    },
    {
      item: "/health/ready",
      ok: Boolean(snapshot?.ready?.ok),
      readyLabel: "已就绪",
      failLabel: "未就绪",
      detail: runtimeStatus?.db_error || "数据库与关键字段检查通过",
    },
    {
      item: "管理员初始化",
      ok: Boolean(runtimeStatus?.admin_bootstrap_ok),
      readyLabel: "成功",
      failLabel: "失败",
      detail: runtimeStatus?.admin_bootstrap_error || "管理员账号初始化正常",
    },
    {
      item: "DASHSCOPE_API_KEY",
      ok: Boolean(runtimeStatus?.dashscope_configured),
      readyLabel: "已配置",
      failLabel: "缺失",
      detail: "缺失会影响转写和翻译调用",
    },
    {
      item: "ffmpeg / ffprobe",
      ok: Boolean(runtimeStatus?.ffmpeg_ready && runtimeStatus?.ffprobe_ready),
      readyLabel: "已就绪",
      failLabel: "异常",
      detail: runtimeStatus?.media_detail || "-",
    },
    {
      item: "最近检查时间",
      ok: Boolean(runtimeStatus?.checked_at),
      readyLabel: "已记录",
      failLabel: "未记录",
      detail: formatDateTimeBeijing(runtimeStatus?.checked_at) || "-",
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">接口状态快照</CardTitle>
          <CardDescription>直接看服务、数据库、管理员初始化和关键运行依赖，先确认系统底层有没有通。</CardDescription>
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
              {loading && !snapshot
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

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
