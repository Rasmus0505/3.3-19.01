import { Bug, Copy, FileWarning, LoaderCircle, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { copyTextToClipboard, formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FilterPanel,
  Input,
  MetricCard,
  MetricChart,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  ResponsiveTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui";

function toLocalDatetimeValue(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTranslationSummary(summary) {
  if (!summary) return "-";
  return `句子 ${summary.total_sentences || 0}，失败 ${summary.failed_sentences || 0}，请求 ${summary.request_count || 0}，Tokens ${summary.total_tokens || 0}`;
}

function stringifyBlock(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function isTaskActive(status) {
  return ["pending", "running"].includes(String(status || "").toLowerCase());
}

function RawCopyButton({ label, text, disabled = false }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={async () => {
        try {
          await copyTextToClipboard(text);
          toast.success(`${label}已复制`);
        } catch (error) {
          toast.error(`复制失败: ${String(error)}`);
        }
      }}
    >
      <Copy className="size-4" />
      复制
    </Button>
  );
}

function DebugBlock({ title, text, copyLabel, emptyText = "暂无内容" }) {
  const normalizedText = String(text || "");
  return (
    <div className="rounded-3xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <RawCopyButton label={copyLabel} text={normalizedText} disabled={!normalizedText} />
      </div>
      <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-background/80 p-3 text-xs">
        {normalizedText || emptyText}
      </pre>
    </div>
  );
}

export function AdminLessonTaskLogsTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(() => readStringParam(searchParams, "status", "all") || "all");
  const [userEmail, setUserEmail] = useState(() => readStringParam(searchParams, "user_email"));
  const [taskId, setTaskId] = useState(() => readStringParam(searchParams, "task_id"));
  const [lessonId, setLessonId] = useState(() => readStringParam(searchParams, "lesson_id"));
  const [sourceFilename, setSourceFilename] = useState(() => readStringParam(searchParams, "source_filename"));
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));
  const [summaryCards, setSummaryCards] = useState([]);
  const [charts, setCharts] = useState([]);
  const { error, clearError, captureError } = useErrorHandler();
  const [detailSeed, setDetailSeed] = useState(null);
  const [detailTaskId, setDetailTaskId] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStatus, setDetailStatus] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        status: statusFilter,
        user_email: userEmail,
        task_id: taskId,
        lesson_id: lessonId,
        source_filename: sourceFilename,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true },
    );
  }, [dateFrom, dateTo, lessonId, page, pageSize, searchParams, setSearchParams, sourceFilename, statusFilter, taskId, userEmail]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        status: statusFilter,
        user_email: userEmail.trim(),
        task_id: taskId.trim(),
        lesson_id: lessonId.trim(),
        source_filename: sourceFilename.trim(),
      });
      const normalizedDateFrom = datetimeLocalToBeijingOffset(dateFrom);
      const normalizedDateTo = datetimeLocalToBeijingOffset(dateTo);
      if (normalizedDateFrom) query.set("date_from", normalizedDateFrom);
      if (normalizedDateTo) query.set("date_to", normalizedDateTo);
      const resp = await apiCall(`/api/admin/lesson-task-logs?${query.toString()}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminLessonTaskLogsTab",
            action: "加载生成日志",
            endpoint: "/api/admin/lesson-task-logs",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载生成日志失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
      setCharts(Array.isArray(data.charts) ? data.charts : []);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminLessonTaskLogsTab",
          action: "加载生成日志",
          endpoint: "/api/admin/lesson-task-logs",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(taskIdToLoad, { silent = false } = {}) {
    if (!taskIdToLoad) return null;
    if (!silent) {
      setDetailLoading(true);
    }
    setDetailStatus("");
    try {
      const resp = await apiCall(`/api/admin/lesson-task-logs/${encodeURIComponent(taskIdToLoad)}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = formatResponseError(resp, data, {
          component: "AdminLessonTaskLogsTab",
          action: "加载生成任务详情",
          endpoint: `/api/admin/lesson-task-logs/${taskIdToLoad}`,
          method: "GET",
          fallbackMessage: "加载任务详情失败",
        });
        setDetailStatus(formattedError.displayMessage);
        return null;
      }
      const nextItem = data?.item || null;
      setDetailItem(nextItem);
      setItems((currentItems) =>
        currentItems.map((item) => (item.task_id === taskIdToLoad ? { ...item, ...nextItem } : item)),
      );
      return nextItem;
    } catch (requestError) {
      const formattedError = formatNetworkError(requestError, {
        component: "AdminLessonTaskLogsTab",
        action: "加载生成任务详情",
        endpoint: `/api/admin/lesson-task-logs/${taskIdToLoad}`,
        method: "GET",
      });
      setDetailStatus(formattedError.displayMessage);
      return null;
    } finally {
      if (!silent) {
        setDetailLoading(false);
      }
    }
  }

  useEffect(() => {
    loadLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    if (!detailTaskId) return undefined;
    const currentStatus = detailItem?.status || detailSeed?.status || "";
    if (!isTaskActive(currentStatus)) return undefined;
    const timer = window.setTimeout(() => {
      loadDetail(detailTaskId, { silent: true });
    }, 3000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailItem?.status, detailSeed?.status, detailTaskId]);

  async function copyFilters() {
    try {
      await copyCurrentUrl();
      toast.success("已复制筛选链接");
    } catch (copyError) {
      toast.error(`复制失败: ${String(copyError)}`);
    }
  }

  function resetFilters() {
    setPage(1);
    setPageSize(20);
    setStatusFilter("all");
    setUserEmail("");
    setTaskId("");
    setLessonId("");
    setSourceFilename("");
    setDateFrom(toLocalDatetimeValue(defaultFrom));
    setDateTo(toLocalDatetimeValue(now));
  }

  async function openDetail(item) {
    setDetailSeed(item);
    setDetailTaskId(String(item.task_id || ""));
    setDetailItem(null);
    setDetailStatus("");
    await loadDetail(String(item.task_id || ""));
  }

  async function deleteRawDebug() {
    if (!detailTaskId) return;
    setDetailBusy(true);
    setDetailStatus("");
    try {
      const resp = await apiCall(`/api/admin/lesson-task-logs/${encodeURIComponent(detailTaskId)}/raw`, { method: "DELETE" });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = formatResponseError(resp, data, {
          component: "AdminLessonTaskLogsTab",
          action: "删除任务原始日志",
          endpoint: `/api/admin/lesson-task-logs/${detailTaskId}/raw`,
          method: "DELETE",
          fallbackMessage: "删除原始日志失败",
        });
        setDetailStatus(formattedError.displayMessage);
        return;
      }
      toast.success("已删除该任务的原始日志");
      await Promise.all([loadDetail(detailTaskId), loadLogs(page)]);
    } catch (requestError) {
      const formattedError = formatNetworkError(requestError, {
        component: "AdminLessonTaskLogsTab",
        action: "删除任务原始日志",
        endpoint: `/api/admin/lesson-task-logs/${detailTaskId}/raw`,
        method: "DELETE",
      });
      setDetailStatus(formattedError.displayMessage);
    } finally {
      setDetailBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo(
    () => [
      { key: "time", header: "时间", mobileLabel: "时间", render: (item) => formatDateTimeBeijing(item.failed_at || item.updated_at || item.created_at) },
      { key: "task", header: "任务", mobileLabel: "任务", render: (item) => item.task_id },
      { key: "user", header: "用户", mobileLabel: "用户", render: (item) => item.user_email || "-" },
      { key: "status", header: "状态", mobileLabel: "状态", render: (item) => <Badge variant={item.status === "failed" ? "destructive" : item.status === "completed" ? "default" : "secondary"}>{item.status}</Badge> },
      { key: "stage", header: "阶段", mobileLabel: "阶段", render: (item) => item.failure_debug?.failed_stage || item.current_stage || "-" },
      {
        key: "raw",
        header: "原始日志",
        mobileLabel: "原始日志",
        render: (item) =>
          item.has_raw_debug ? (
            <Badge variant="outline">已保留</Badge>
          ) : item.raw_debug_purged_at ? (
            <Badge variant="secondary">已清理</Badge>
          ) : (
            "-"
          ),
      },
      { key: "message", header: "错误摘要", mobileLabel: "错误摘要", render: (item) => item.message || "-" },
      { key: "resume", header: "续跑", mobileLabel: "续跑", render: (item) => (item.resume_available ? "可继续" : "不可继续") },
      { key: "detail", header: "详情", render: (item) => <Button size="sm" variant="outline" onClick={() => openDetail(item)}>查看详情</Button> },
    ],
    [],
  );

  const detailView = detailItem || detailSeed;
  const asrRawText = stringifyBlock(detailItem?.asr_raw);
  const errorText = stringifyBlock(
    detailItem
      ? {
          error_code: detailItem.error_code,
          message: detailItem.message,
          exception_type: detailItem.exception_type,
          detail_excerpt: detailItem.detail_excerpt,
          traceback_excerpt: detailItem.traceback_excerpt,
          last_progress_text: detailItem.last_progress_text,
        }
      : null,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(summaryCards.length ? summaryCards : [{ label: "匹配任务", value: total, hint: "当前筛选结果", tone: "info" }]).map((item) => (
          <MetricCard key={item.label} icon={Bug} label={item.label} value={item.value} hint={item.hint} tone={item.tone || "default"} loading={loading && items.length === 0} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {charts.map((chart) => (
          <MetricChart key={chart.title} title={chart.title} description={chart.description} data={chart.data} series={chart.series} type={chart.type} xKey={chart.x_key} loading={loading && charts.length === 0} />
        ))}
      </div>

      <FilterPanel
        title="生成失败筛选"
        description="按任务、用户、素材、阶段和时间范围缩小问题面，摘要卡和图表会同步按当前筛选刷新。"
        onSubmit={() => {
          setPage(1);
          loadLogs(1);
        }}
        onReset={resetFilters}
        actions={
          <>
            <Button variant="outline" type="button" onClick={copyFilters}>
              复制筛选链接
            </Button>
            <Button variant="outline" type="button" onClick={() => loadLogs(page)} disabled={loading}>
              <RefreshCcw className="size-4" />
              刷新
            </Button>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPage(1);
                setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-[120px] rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / 页</SelectItem>
                <SelectItem value="20">20 / 页</SelectItem>
                <SelectItem value="50">50 / 页</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="failed">失败</SelectItem>
            <SelectItem value="running">处理中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
          </SelectContent>
        </Select>
        <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="用户邮箱" className="rounded-xl" />
        <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="任务 ID" className="rounded-xl" />
        <Input value={lessonId} onChange={(event) => setLessonId(event.target.value)} placeholder="课程 ID" className="rounded-xl" />
        <Input value={sourceFilename} onChange={(event) => setSourceFilename(event.target.value)} placeholder="素材文件名" className="rounded-xl" />
        <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl" />
        <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl" />
      </FilterPanel>

      <ResponsiveTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        mobileTitle={(item) => item.task_id}
        mobileDescription={(item) => `${item.status} · ${item.failure_debug?.failed_stage || item.current_stage || "-"}`}
        mobileFooter={(item) => item.message || item.failure_debug?.detail_excerpt || "暂无错误摘要"}
        emptyText="暂无生成任务日志"
        loading={loading}
        minWidth={1620}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">总计 {total} 条</p>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious disabled={page <= 1} onClick={() => setPage(page - 1)} />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink isActive className="px-2.5">
                {page} / {pageCount}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext disabled={page >= pageCount} onClick={() => setPage(page + 1)} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{status}</div>
      ) : null}

      <Dialog
        open={Boolean(detailTaskId)}
        onOpenChange={(open) => {
          if (open) return;
          setDetailTaskId("");
          setDetailSeed(null);
          setDetailItem(null);
          setDetailStatus("");
          setDetailLoading(false);
          setDetailBusy(false);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>生成任务详情</DialogTitle>
            <DialogDescription>
              {detailView?.task_id || "-"} · {detailView?.source_filename || "-"}
            </DialogDescription>
          </DialogHeader>
          {detailLoading && !detailItem ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              正在加载任务详情
            </div>
          ) : null}
          {detailView ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={FileWarning} label="当前阶段" value={detailView.failure_debug?.failed_stage || detailView.current_stage || "-"} hint="优先看最先失败的步骤" tone="danger" />
                <MetricCard icon={Bug} label="任务状态" value={detailView.status || "-"} hint={formatDateTimeBeijing(detailView.failed_at || detailView.updated_at || detailView.created_at)} tone={detailView.status === "failed" ? "danger" : detailView.status === "running" ? "warning" : "success"} />
                <MetricCard icon={Bug} label="续跑能力" value={detailView.resume_available ? "可继续生成" : "不可继续"} hint={detailView.resume_stage ? `断点阶段：${detailView.resume_stage}` : "无可用断点"} tone={detailView.resume_available ? "success" : "warning"} />
                <MetricCard icon={Bug} label="原始日志" value={detailItem?.has_raw_debug ? "已保留" : detailView.raw_debug_purged_at ? "已清理" : "暂无"} hint={detailView.raw_debug_purged_at ? `清理时间：${formatDateTimeBeijing(detailView.raw_debug_purged_at)}` : "ASR 与翻译原始返回"} tone={detailItem?.has_raw_debug ? "info" : "default"} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" type="button" onClick={() => loadDetail(detailTaskId)} disabled={!detailTaskId || detailBusy}>
                  <RefreshCcw className="size-4" />
                  刷新详情
                </Button>
                <Button variant="outline" type="button" onClick={deleteRawDebug} disabled={!detailItem || !detailItem.has_raw_debug || detailBusy}>
                  <Trash2 className="size-4" />
                  删除原始日志
                </Button>
                {detailBusy ? <span className="text-xs text-muted-foreground">正在清理原始日志</span> : null}
                {isTaskActive(detailView.status) ? <span className="text-xs text-muted-foreground">任务处理中，详情会自动刷新</span> : null}
              </div>

              {detailStatus ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{detailStatus}</div> : null}

              <DebugBlock title="任务/失败概览" text={errorText} copyLabel="错误信息" emptyText="暂无错误信息" />

              <div className="rounded-3xl border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">ASR 原始结果</p>
                  <RawCopyButton label="ASR 原始结果" text={asrRawText} disabled={!asrRawText} />
                </div>
                <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-background/80 p-3 text-xs">
                  {asrRawText || (detailView.raw_debug_purged_at ? "原始日志已清理，仅保留摘要" : "暂无 ASR 原始结果")}
                </pre>
              </div>

              <div className="rounded-3xl border bg-muted/20 p-4">
                <p className="font-medium">翻译调试摘要</p>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-background/80 p-3 text-xs">
                  {formatTranslationSummary(detailView.translation_debug_summary)}
                </pre>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">翻译原始请求与原始返回</p>
                  <span className="text-xs text-muted-foreground">共 {detailItem?.translation_attempts?.length || 0} 条</span>
                </div>
                {detailItem?.translation_attempts?.length ? (
                  detailItem.translation_attempts.map((attempt) => (
                    <div key={attempt.id} className="rounded-3xl border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={attempt.success ? "default" : "destructive"}>{attempt.success ? "成功" : "失败"}</Badge>
                        <span className="text-sm font-medium">
                          第 {attempt.sentence_idx + 1} 句 · 第 {attempt.attempt_no} 次
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {attempt.provider} / {attempt.model_name} · {formatDateTimeBeijing(attempt.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        预览：{attempt.input_text_preview || "-"} · Tokens {attempt.total_tokens || 0}
                        {attempt.status_code ? ` · HTTP ${attempt.status_code}` : ""}
                        {attempt.error_code ? ` · ${attempt.error_code}` : ""}
                      </p>
                      <div className="mt-4 grid gap-4 xl:grid-cols-3">
                        <DebugBlock title="原始请求" text={attempt.raw_request_text} copyLabel="翻译原始请求" emptyText="暂无原始请求" />
                        <DebugBlock title="原始返回" text={attempt.raw_response_text} copyLabel="翻译原始返回" emptyText="暂无原始返回" />
                        <DebugBlock title="原始报错" text={attempt.raw_error_text || attempt.error_message} copyLabel="翻译原始报错" emptyText="暂无原始报错" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    暂无翻译原始请求记录
                  </div>
                )}
              </div>

              <DebugBlock title="完整失败调试对象" text={stringifyBlock(detailView.failure_debug)} copyLabel="失败调试对象" emptyText="暂无失败调试对象" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
