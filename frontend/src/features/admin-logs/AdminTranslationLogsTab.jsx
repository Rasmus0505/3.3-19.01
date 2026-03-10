import { Languages, RefreshCcw } from "lucide-react";
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

export function AdminTranslationLogsTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState(() => readStringParam(searchParams, "user_email"));
  const [taskId, setTaskId] = useState(() => readStringParam(searchParams, "task_id"));
  const [lessonId, setLessonId] = useState(() => readStringParam(searchParams, "lesson_id"));
  const [success, setSuccess] = useState(() => readStringParam(searchParams, "success", "all") || "all");
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));
  const [summaryCards, setSummaryCards] = useState([]);
  const [charts, setCharts] = useState([]);

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        user_email: userEmail,
        task_id: taskId,
        lesson_id: lessonId,
        success,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true },
    );
  }, [dateFrom, dateTo, lessonId, page, pageSize, searchParams, setSearchParams, success, taskId, userEmail]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
        task_id: taskId.trim(),
        lesson_id: lessonId.trim(),
        success,
      });
      const normalizedDateFrom = datetimeLocalToBeijingOffset(dateFrom);
      const normalizedDateTo = datetimeLocalToBeijingOffset(dateTo);
      if (normalizedDateFrom) query.set("date_from", normalizedDateFrom);
      if (normalizedDateTo) query.set("date_to", normalizedDateTo);
      const resp = await apiCall(`/api/admin/translation-logs?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载翻译日志失败");
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
    setUserEmail("");
    setTaskId("");
    setLessonId("");
    setSuccess("all");
    setDateFrom(toLocalDatetimeValue(defaultFrom));
    setDateTo(toLocalDatetimeValue(now));
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo(
    () => [
      { key: "time", header: "时间", mobileLabel: "时间", render: (item) => formatDateTimeBeijing(item.created_at) },
      { key: "user", header: "用户", mobileLabel: "用户", render: (item) => item.user_email || "-" },
      { key: "task", header: "任务", mobileLabel: "任务", render: (item) => item.task_id || "-" },
      { key: "provider", header: "模型", mobileLabel: "模型", render: (item) => `${item.provider} / ${item.model_name}` },
      { key: "result", header: "结果", mobileLabel: "结果", render: (item) => <Badge variant={item.success ? "default" : "destructive"}>{item.success ? "成功" : "失败"}</Badge> },
      { key: "tokens", header: "Tokens", mobileLabel: "Tokens", render: (item) => item.total_tokens },
      { key: "error", header: "错误", mobileLabel: "错误", render: (item) => item.error_message || "-" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(summaryCards.length ? summaryCards : [{ label: "匹配请求", value: total, hint: "当前筛选结果", tone: "info" }]).map((item) => (
          <MetricCard key={item.label} icon={Languages} label={item.label} value={item.value} hint={item.hint} tone={item.tone || "default"} loading={loading && items.length === 0} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {charts.map((chart) => (
          <MetricChart key={chart.title} title={chart.title} description={chart.description} data={chart.data} series={chart.series} type={chart.type} xKey={chart.x_key} loading={loading && charts.length === 0} />
        ))}
      </div>

      <FilterPanel
        title="翻译日志筛选"
        description="按用户、任务、课程、结果和时间范围追翻译请求，图表和摘要会跟着筛选一起变。"
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
        <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="用户邮箱" className="rounded-xl" />
        <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="任务 ID" className="rounded-xl" />
        <Input value={lessonId} onChange={(event) => setLessonId(event.target.value)} placeholder="课程 ID" className="rounded-xl" />
        <Select value={success} onValueChange={setSuccess}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部结果</SelectItem>
            <SelectItem value="true">成功</SelectItem>
            <SelectItem value="false">失败</SelectItem>
          </SelectContent>
        </Select>
        <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl" />
        <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl" />
      </FilterPanel>

      <ResponsiveTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        mobileTitle={(item) => item.task_id || `请求 #${item.id}`}
        mobileDescription={(item) => `${item.provider} / ${item.model_name}`}
        mobileFooter={(item) => `${item.success ? "成功" : "失败"} · ${item.total_tokens} Tokens`}
        emptyText="暂无翻译日志"
        loading={loading}
        minWidth={1360}
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
    </div>
  );
}
