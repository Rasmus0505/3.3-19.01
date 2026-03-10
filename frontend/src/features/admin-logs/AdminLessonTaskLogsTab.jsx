import { Bug, FileWarning, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import {
  Alert,
  AlertDescription,
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

function toLocalDatetimeValue(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTranslationSummary(summary) {
  if (!summary) return "-";
  return `句子 ${summary.total_sentences || 0}，失败 ${summary.failed_sentences || 0}，请求 ${summary.request_count || 0}，Tokens ${summary.total_tokens || 0}`;
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
  const [detailItem, setDetailItem] = useState(null);

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
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载生成日志失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
      setCharts(Array.isArray(data.charts) ? data.charts : []);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  async function copyFilters() {
    try {
      await copyCurrentUrl();
      toast.success("已复制筛选链接");
    } catch (error) {
      toast.error(`复制失败: ${String(error)}`);
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo(
    () => [
      { key: "time", header: "时间", mobileLabel: "时间", render: (item) => formatDateTimeBeijing(item.failed_at || item.updated_at || item.created_at) },
      { key: "task", header: "任务", mobileLabel: "任务", render: (item) => item.task_id },
      { key: "user", header: "用户", mobileLabel: "用户", render: (item) => item.user_email || "-" },
      { key: "status", header: "状态", mobileLabel: "状态", render: (item) => <Badge variant={item.status === "failed" ? "destructive" : item.status === "completed" ? "default" : "secondary"}>{item.status}</Badge> },
      { key: "stage", header: "阶段", mobileLabel: "阶段", render: (item) => item.failure_debug?.failed_stage || item.current_stage || "-" },
      { key: "message", header: "错误摘要", mobileLabel: "错误摘要", render: (item) => item.message || "-" },
      { key: "resume", header: "续跑", mobileLabel: "续跑", render: (item) => (item.resume_available ? "可继续" : "不可继续") },
      { key: "detail", header: "详情", render: (item) => <Button size="sm" variant="outline" onClick={() => setDetailItem(item)}>查看详情</Button> },
    ],
    [],
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
        minWidth={1500}
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

      {status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>生成失败详情</DialogTitle>
            <DialogDescription>
              {detailItem?.task_id || "-"} · {detailItem?.source_filename || "-"}
            </DialogDescription>
          </DialogHeader>
          {detailItem ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard icon={FileWarning} label="失败阶段" value={detailItem.failure_debug?.failed_stage || detailItem.current_stage || "-"} hint="优先看最先失败的步骤" tone="danger" />
                <MetricCard icon={Bug} label="可否续跑" value={detailItem.resume_available ? "可继续生成" : "不可继续"} hint={formatDateTimeBeijing(detailItem.failed_at || detailItem.updated_at || detailItem.created_at)} tone={detailItem.resume_available ? "success" : "warning"} />
              </div>
              <div className="rounded-3xl border bg-muted/20 p-4">
                <p className="font-medium">错误信息</p>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{detailItem.message || detailItem.failure_debug?.detail_excerpt || "-"}</pre>
              </div>
              <div className="rounded-3xl border bg-muted/20 p-4">
                <p className="font-medium">翻译调试摘要</p>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{formatTranslationSummary(detailItem.translation_debug_summary)}</pre>
              </div>
              <div className="rounded-3xl border bg-muted/20 p-4">
                <p className="font-medium">完整失败调试对象</p>
                <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(detailItem.failure_debug, null, 2)}</pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
