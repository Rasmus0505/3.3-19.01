import { AlertTriangle, ClipboardCheck, Copy, RefreshCcw, ServerCrash, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { buildAdminIssueCopyText, copyTextToClipboard, formatNetworkError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

function StatusBadge({ ok, readyLabel = "正常", failLabel = "异常" }) {
  return <Badge variant={ok ? "default" : "destructive"}>{ok ? readyLabel : failLabel}</Badge>;
}

function severityBadgeVariant(severity) {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "outline";
  if (severity === "ok") return "default";
  return "secondary";
}

function buildPrompt(title, summary, endpointSnapshot) {
  return [
    "请你作为这个仓库的开发 AI，优先给出最小修复方案。",
    `当前问题：${title}`,
    `现象摘要：${summary}`,
    "请按下面顺序处理：",
    "1. 先判断是不是数据库迁移、环境变量、依赖或最近代码回归导致。",
    "2. 如果是部署问题，请明确告诉我要去 Zeabur 检查哪个服务日志或环境变量。",
    "3. 如果需要改代码，请只给最小必要修改，不要改 API 契约，不要吞掉原始报错。",
    "4. 如果判断和数据库结构有关，请说明是否需要执行 `python -m alembic -c alembic.ini upgrade head`。",
    "",
    "接口快照：",
    JSON.stringify(endpointSnapshot, null, 2),
  ].join("\n");
}

function previewTaskItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 3).map((item) => ({
    label: `${item.task_id || "-"} · ${item.failure_debug?.failed_stage || item.current_stage || "-"}`,
    detail: `${item.error_code || "ERROR"}: ${item.message || "任务失败"}`,
  }));
}

function previewTranslationItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 3).map((item) => ({
    label: `${item.task_id || `请求 #${item.id || "-"}`} · ${item.provider || "-"} / ${item.model_name || "-"}`,
    detail: item.error_message || item.error_code || "翻译请求失败",
  }));
}

function previewOperationItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 3).map((item) => ({
    label: `${item.action_type || "-"} · ${item.operator_user_email || "未知操作员"}`,
    detail: `${item.target_type || "-"} / ${item.target_id || "-"}${item.note ? ` · ${item.note}` : ""}`,
  }));
}

export function AdminSystemTab({ apiCall }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const { error, clearError, captureError } = useErrorHandler();

  async function loadSystem() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const [healthResp, readyResp, overviewResp, tasksResp, translationsResp, operationsResp] = await Promise.all([
        apiCall("/health"),
        apiCall("/health/ready"),
        apiCall("/api/admin/overview"),
        apiCall("/api/admin/lesson-task-logs?status=failed&page=1&page_size=5"),
        apiCall("/api/admin/translation-logs?success=false&page=1&page_size=5"),
        apiCall("/api/admin/operation-logs?page=1&page_size=5"),
      ]);
      const [healthData, readyData, overviewData, tasksData, translationsData, operationsData] = await Promise.all([
        parseJsonSafely(healthResp),
        parseJsonSafely(readyResp),
        parseJsonSafely(overviewResp),
        parseJsonSafely(tasksResp),
        parseJsonSafely(translationsResp),
        parseJsonSafely(operationsResp),
      ]);

      setSnapshot({
        health: { ok: healthResp.ok, status: healthResp.status, data: healthData },
        ready: { ok: readyResp.ok, status: readyResp.status, data: readyData },
        overview: { ok: overviewResp.ok, status: overviewResp.status, data: overviewData },
        tasks: { ok: tasksResp.ok, status: tasksResp.status, data: tasksData },
        translations: { ok: translationsResp.ok, status: translationsResp.status, data: translationsData },
        operations: { ok: operationsResp.ok, status: operationsResp.status, data: operationsData },
      });
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSystemTab",
          action: "加载系统健康诊断",
          endpoint: "/health + /health/ready + /api/admin/*",
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

  const runtimeStatus = snapshot?.ready?.data?.status || {};
  const endpointSnapshot = useMemo(
    () => ({
      health: { status: snapshot?.health?.status || 0, ok: Boolean(snapshot?.health?.ok), body: snapshot?.health?.data || {} },
      ready: { status: snapshot?.ready?.status || 0, ok: Boolean(snapshot?.ready?.ok), body: snapshot?.ready?.data || {} },
      overview: { status: snapshot?.overview?.status || 0, ok: Boolean(snapshot?.overview?.ok) },
      lesson_task_logs: { status: snapshot?.tasks?.status || 0, ok: Boolean(snapshot?.tasks?.ok), total: Number(snapshot?.tasks?.data?.total || 0) },
      translation_logs: { status: snapshot?.translations?.status || 0, ok: Boolean(snapshot?.translations?.ok), total: Number(snapshot?.translations?.data?.total || 0) },
      operation_logs: { status: snapshot?.operations?.status || 0, ok: Boolean(snapshot?.operations?.ok), total: Number(snapshot?.operations?.data?.total || 0) },
    }),
    [snapshot],
  );

  const summaryCards = useMemo(
    () => [
      {
        label: "服务存活",
        ok: Boolean(snapshot?.health?.ok && snapshot?.health?.data?.ok !== false),
        hint: `${snapshot?.health?.status || "-"} · ${snapshot?.health?.data?.service || "-"}`,
      },
      {
        label: "数据库就绪",
        ok: Boolean(snapshot?.ready?.ok && runtimeStatus?.db_ready),
        hint: runtimeStatus?.db_error || "关键业务表与字段已就绪",
      },
      {
        label: "管理员初始化",
        ok: Boolean(runtimeStatus?.admin_bootstrap_ok),
        hint: runtimeStatus?.admin_bootstrap_error || "管理员账号初始化正常",
      },
      {
        label: "关键后台接口",
        ok: Boolean(snapshot?.overview?.ok && snapshot?.tasks?.ok && snapshot?.translations?.ok && snapshot?.operations?.ok),
        hint: [snapshot?.overview?.status, snapshot?.tasks?.status, snapshot?.translations?.status, snapshot?.operations?.status].filter(Boolean).join(" / "),
      },
      {
        label: "近 24 小时异常",
        value: Number(snapshot?.overview?.data?.metrics?.incidents_24h || 0),
        hint: "来自总览统计，优先看翻译失败和兑换失败",
      },
    ],
    [runtimeStatus, snapshot],
  );

  const issues = useMemo(() => {
    const taskItems = snapshot?.tasks?.data?.items || [];
    const translationItems = snapshot?.translations?.data?.items || [];
    const operationItems = snapshot?.operations?.data?.items || [];
    const nextIssues = [];

    if (!snapshot?.ready?.ok || runtimeStatus?.db_ready === false) {
      const summary = runtimeStatus?.db_error || "数据库还没有准备好，管理台接口可能部分不可用。";
      nextIssues.push({
        id: "db-not-ready",
        severity: "critical",
        title: "数据库未就绪",
        summary,
        impact: "登录活跃、后台统计和新任务创建都可能失败。",
        statusLines: [
          `/health: ${snapshot?.health?.status || "-"}`,
          `/health/ready: ${snapshot?.ready?.status || "-"}`,
          `checked_at: ${formatDateTimeBeijing(runtimeStatus?.checked_at)}`,
        ],
        logs: { db_error: runtimeStatus?.db_error || "", runtime_status: runtimeStatus },
        endpointSnapshot,
        zeaburHints: [
          "先看 web 服务最近一次启动日志，确认自动迁移有没有失败。",
          "检查 Zeabur 的 DATABASE_URL 是否指向正确的 PostgreSQL 服务。",
          "如果日志里提示缺表或缺字段，在 web 服务终端执行 `python -m alembic -c alembic.ini upgrade head`。",
        ],
        prompt: buildPrompt("数据库未就绪", summary, endpointSnapshot),
      });
    }

    if (!runtimeStatus?.admin_bootstrap_ok) {
      const summary = runtimeStatus?.admin_bootstrap_error || "管理员初始化失败，后台账号可能无法正常进入。";
      nextIssues.push({
        id: "admin-bootstrap",
        severity: "warning",
        title: "管理员初始化异常",
        summary,
        impact: "管理员白名单账号可能无法自动准备好。",
        statusLines: [`admin_bootstrap_ok: ${String(runtimeStatus?.admin_bootstrap_ok)}`],
        logs: { admin_bootstrap_error: runtimeStatus?.admin_bootstrap_error || "" },
        endpointSnapshot,
        zeaburHints: [
          "检查 ADMIN_EMAILS 环境变量是否填写了正确邮箱。",
          "确认用户注册后邮箱和 ADMIN_EMAILS 中的值完全一致。",
        ],
        prompt: buildPrompt("管理员初始化异常", summary, endpointSnapshot),
      });
    }

    if (!runtimeStatus?.dashscope_configured || !runtimeStatus?.ffmpeg_ready || !runtimeStatus?.ffprobe_ready) {
      const missingParts = [
        !runtimeStatus?.dashscope_configured ? "DASHSCOPE_API_KEY" : "",
        !runtimeStatus?.ffmpeg_ready ? "ffmpeg" : "",
        !runtimeStatus?.ffprobe_ready ? "ffprobe" : "",
      ].filter(Boolean);
      const summary = `运行依赖缺失：${missingParts.join("、") || "未知依赖"}。`;
      nextIssues.push({
        id: "runtime-deps",
        severity: "warning",
        title: "转写运行依赖不完整",
        summary,
        impact: "上传转写、翻译或媒体处理链路会直接失败。",
        statusLines: [
          `dashscope_configured: ${String(runtimeStatus?.dashscope_configured)}`,
          `ffmpeg_ready: ${String(runtimeStatus?.ffmpeg_ready)}`,
          `ffprobe_ready: ${String(runtimeStatus?.ffprobe_ready)}`,
          `media_detail: ${runtimeStatus?.media_detail || "-"}`,
        ],
        logs: { runtime_status: runtimeStatus },
        endpointSnapshot,
        zeaburHints: [
          "检查 Zeabur 的 DASHSCOPE_API_KEY 是否已配置。",
          "如果是自定义镜像改动，确认 Dockerfile 仍然安装了 ffmpeg。",
          "重新部署后先看 `/health/ready` 是否恢复正常。",
        ],
        prompt: buildPrompt("转写运行依赖不完整", summary, endpointSnapshot),
      });
    }

    if (Number(snapshot?.tasks?.data?.total || 0) > 0) {
      const previews = previewTaskItems(taskItems);
      const summary = `最近有 ${Number(snapshot?.tasks?.data?.total || 0)} 条失败任务，最常见的是 ${previews[0]?.label || "生成失败"}`;
      nextIssues.push({
        id: "lesson-task-failed",
        severity: "critical",
        title: "最近存在生成失败任务",
        summary,
        impact: "用户上传后可能卡在识别、翻译或写课阶段。",
        statusLines: previews.map((item) => `${item.label}\n${item.detail}`),
        logs: taskItems.slice(0, 3),
        endpointSnapshot,
        zeaburHints: [
          "先看 web 服务日志里对应 task_id 的完整报错。",
          "如果失败集中在同一阶段，优先检查最近改动和对应外部依赖。",
          "必要时在后台“生成失败”里复制原始调试信息继续深挖。",
        ],
        prompt: buildPrompt("最近存在生成失败任务", summary, endpointSnapshot),
      });
    }

    if (Number(snapshot?.translations?.data?.total || 0) > 0) {
      const previews = previewTranslationItems(translationItems);
      const summary = `最近有 ${Number(snapshot?.translations?.data?.total || 0)} 条翻译失败记录。`;
      nextIssues.push({
        id: "translation-failed",
        severity: "warning",
        title: "最近存在翻译失败",
        summary,
        impact: "字幕生成可能中断，用户看到课程生成失败或翻译缺失。",
        statusLines: previews.map((item) => `${item.label}\n${item.detail}`),
        logs: translationItems.slice(0, 3),
        endpointSnapshot,
        zeaburHints: [
          "检查 MT_BASE_URL、翻译模型和外部服务配额。",
          "如果是 429 或 5xx，先看是否为上游限流或临时抖动。",
          "对照失败时间，看是不是某次部署后开始集中出现。",
        ],
        prompt: buildPrompt("最近存在翻译失败", summary, endpointSnapshot),
      });
    }

    if (operationItems.length > 0) {
      const previews = previewOperationItems(operationItems);
      const summary = "后台最近有敏感操作变更，排障时要先确认是不是人为操作影响了数据。";
      nextIssues.push({
        id: "recent-operations",
        severity: "info",
        title: "最近有后台敏感操作",
        summary,
        impact: "调账、批次状态变更或调试数据清理可能改变现场。",
        statusLines: previews.map((item) => `${item.label}\n${item.detail}`),
        logs: operationItems.slice(0, 5),
        endpointSnapshot,
        zeaburHints: [
          "排障前先确认这些操作是否为预期变更，避免把正常操作误判成系统故障。",
          "如果问题出现在某次人工调整后，优先回查操作时间和对象 ID。",
        ],
        prompt: buildPrompt("最近有后台敏感操作", summary, endpointSnapshot),
      });
    }

    if (!nextIssues.length) {
      const summary = "当前未发现阻塞性问题，服务、数据库和关键后台接口都可用。";
      nextIssues.push({
        id: "healthy",
        severity: "ok",
        title: "当前未发现阻塞性问题",
        summary,
        impact: "适合做例行巡检或继续查看明细页。",
        statusLines: [`checked_at: ${formatDateTimeBeijing(runtimeStatus?.checked_at)}`],
        logs: endpointSnapshot,
        endpointSnapshot,
        zeaburHints: [
          "如果用户仍反馈问题，优先去生成失败、翻译失败或余额流水页按具体对象排查。",
        ],
        prompt: buildPrompt("当前未发现阻塞性问题", summary, endpointSnapshot),
      });
    }

    return nextIssues;
  }, [endpointSnapshot, runtimeStatus, snapshot]);

  async function copyIssue(issue) {
    try {
      await copyTextToClipboard(buildAdminIssueCopyText(issue));
      toast.success(`已复制：${issue.title}`);
    } catch (requestError) {
      toast.error(`复制失败: ${String(requestError)}`);
    }
  }

  const previewBlocks = [
    { key: "tasks", title: "最近失败任务", items: previewTaskItems(snapshot?.tasks?.data?.items) },
    { key: "translations", title: "最近翻译失败", items: previewTranslationItems(snapshot?.translations?.data?.items) },
    { key: "operations", title: "最近后台操作", items: previewOperationItems(snapshot?.operations?.data?.items) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" />
              系统健康诊断
            </CardTitle>
            <CardDescription>先看服务、数据库和关键后台接口是否就绪，再把失败任务、翻译失败和后台敏感操作整理成可直接发给 AI 的修复包。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadSystem} disabled={loading}>
            <RefreshCcw className="size-4" />
            重新诊断
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {loading && !snapshot
          ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[128px] w-full" />)
          : summaryCards.map((item) => (
              <Card key={item.label}>
                <CardContent className="space-y-2 p-5">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  {"ok" in item ? <StatusBadge ok={item.ok} /> : <p className="text-2xl font-semibold">{item.value}</p>}
                  <p className="text-xs whitespace-pre-wrap break-words text-muted-foreground">{item.hint}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">接口状态快照</CardTitle>
          <CardDescription>这里直接列出健康检查和关键后台接口状态，能快速判断问题在服务层、数据库层还是后台数据层。</CardDescription>
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
              <TableRow>
                <TableCell>/health</TableCell>
                <TableCell><StatusBadge ok={Boolean(snapshot?.health?.ok)} readyLabel="200" failLabel="失败" /></TableCell>
                <TableCell>{snapshot?.health?.status || "-"} · {snapshot?.health?.data?.service || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>/health/ready</TableCell>
                <TableCell><StatusBadge ok={Boolean(snapshot?.ready?.ok)} readyLabel="已就绪" failLabel="未就绪" /></TableCell>
                <TableCell>{runtimeStatus?.db_error || "数据库与关键字段已通过检查"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>管理员初始化</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus?.admin_bootstrap_ok)} readyLabel="成功" failLabel="失败" /></TableCell>
                <TableCell>{runtimeStatus?.admin_bootstrap_error || "管理员账号初始化正常"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>DASHSCOPE_API_KEY</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus?.dashscope_configured)} readyLabel="已配置" failLabel="缺失" /></TableCell>
                <TableCell>缺失会影响转写和翻译调用</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>ffmpeg / ffprobe</TableCell>
                <TableCell><StatusBadge ok={Boolean(runtimeStatus?.ffmpeg_ready && runtimeStatus?.ffprobe_ready)} readyLabel="已就绪" failLabel="异常" /></TableCell>
                <TableCell>{runtimeStatus?.media_detail || "-"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>最近检查时间</TableCell>
                <TableCell>{runtimeStatus?.checked_at ? "已记录" : "未记录"}</TableCell>
                <TableCell>{formatDateTimeBeijing(runtimeStatus?.checked_at)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">问题卡片</CardTitle>
          <CardDescription>每张卡都能一键复制“问题摘要 + 关键日志 + Zeabur 提示 + 发给开发 AI 的 prompt”。</CardDescription>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {issues.map((issue) => (
            <Card key={issue.id} className="rounded-3xl border shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{issue.title}</CardTitle>
                      <Badge variant={severityBadgeVariant(issue.severity)}>{issue.severity}</Badge>
                    </div>
                    <CardDescription>{issue.summary}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyIssue(issue)}>
                    <Copy className="size-4" />
                    复制给 AI 修复
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium">影响范围</p>
                  <p className="mt-1 text-sm text-muted-foreground">{issue.impact}</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium">关键状态</p>
                  <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                    {issue.statusLines?.map((line, index) => (
                      <pre key={index} className="whitespace-pre-wrap break-words rounded-xl bg-background/80 p-3 text-xs">
                        {line}
                      </pre>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {previewBlocks.map((block) => (
          <Card key={block.key} className="rounded-3xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{block.title}</CardTitle>
              <CardDescription>诊断页只展示最近几条摘要，需要深挖时切到上方对应面板。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {block.items.length ? (
                block.items.map((item, index) => (
                  <div key={`${block.key}-${index}`} className="rounded-2xl border bg-muted/15 p-3">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">暂无异常摘要</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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
