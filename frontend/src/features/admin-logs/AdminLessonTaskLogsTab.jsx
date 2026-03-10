import { Bug, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

function getStatusVariant(status) {
  if (status === "failed") return "destructive";
  if (status === "succeeded") return "default";
  return "outline";
}

function formatTranslationSummary(summary) {
  if (!summary) return "-";
  const headline = `失败 ${Number(summary.failed_sentences || 0)}/${Number(summary.total_sentences || 0)} · 请求 ${Number(summary.request_count || 0)}`;
  const usage = Number(summary.total_tokens || 0) > 0 ? `Tokens ${Number(summary.total_tokens || 0)} · ${Number(summary.charged_points || 0)} 点` : "";
  const latest = String(summary.latest_error_summary || "").trim();
  return [headline, usage, latest].filter(Boolean).join("\n");
}

function formatTracebackPreview(tracebackExcerpt) {
  const text = String(tracebackExcerpt || "").trim();
  if (!text) return "";
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(0, 4).join("\n");
}

export function AdminLessonTaskLogsTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [taskStatus, setTaskStatus] = useState(() => readStringParam(searchParams, "status", "all") || "all");
  const [userEmail, setUserEmail] = useState(() => readStringParam(searchParams, "user_email"));
  const [taskId, setTaskId] = useState(() => readStringParam(searchParams, "task_id"));
  const [lessonId, setLessonId] = useState(() => readStringParam(searchParams, "lesson_id"));
  const [sourceFilename, setSourceFilename] = useState(() => readStringParam(searchParams, "source_filename"));
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));
  const [detailItem, setDetailItem] = useState(null);

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        status: taskStatus,
        user_email: userEmail,
        task_id: taskId,
        lesson_id: lessonId,
        source_filename: sourceFilename,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true }
    );
  }, [dateFrom, dateTo, lessonId, page, pageSize, setSearchParams, sourceFilename, taskId, taskStatus, userEmail]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        status: taskStatus,
        user_email: userEmail.trim(),
        task_id: taskId.trim(),
        source_filename: sourceFilename.trim(),
      });
      const normalizedLessonId = lessonId.trim();
      if (normalizedLessonId) query.set("lesson_id", normalizedLessonId);
      const normalizedDateFrom = datetimeLocalToBeijingOffset(dateFrom);
      const normalizedDateTo = datetimeLocalToBeijingOffset(dateTo);
      if (normalizedDateFrom) query.set("date_from", normalizedDateFrom);
      if (normalizedDateTo) query.set("date_to", normalizedDateTo);
      const resp = await apiCall(`/api/admin/lesson-task-logs?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载生成任务日志失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="size-4" />
            生成任务日志
          </CardTitle>
          <CardDescription>查看课程生成任务的失败阶段、错误码、调试摘要和断点状态，优先定位为什么生成失败。</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyFilters}>
            复制筛选链接
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadLogs(page)} disabled={loading}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 md:grid-cols-3 xl:grid-cols-7"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadLogs(1);
          }}
        >
          <Select value={taskStatus} onValueChange={setTaskStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="running">进行中</SelectItem>
              <SelectItem value="pending">等待中</SelectItem>
              <SelectItem value="succeeded">成功</SelectItem>
            </SelectContent>
          </Select>
          <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="用户邮箱" />
          <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="任务 ID" />
          <Input value={lessonId} onChange={(event) => setLessonId(event.target.value)} placeholder="课程 ID" />
          <Input value={sourceFilename} onChange={(event) => setSourceFilename(event.target.value)} placeholder="文件名" />
          <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button type="submit" variant="outline" disabled={loading} className="xl:col-span-7">
            查询
          </Button>
        </form>

        {loading ? <Skeleton className="h-10 w-full" /> : null}

        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[1900px]">
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>任务 / 课程</TableHead>
                <TableHead>文件名</TableHead>
                <TableHead>阶段</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>错误码</TableHead>
                <TableHead>用户提示</TableHead>
                <TableHead>调试摘要</TableHead>
                <TableHead>翻译摘要</TableHead>
                <TableHead>断点续跑</TableHead>
                <TableHead>详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDateTimeBeijing(item.failed_at || item.updated_at || item.created_at)}</TableCell>
                  <TableCell>{item.user_email || "-"}</TableCell>
                  <TableCell className="max-w-[220px] whitespace-normal break-words">
                    <div className="space-y-1">
                      <p>{item.task_id}</p>
                      <p className="text-xs text-muted-foreground">课程 {item.lesson_id ?? "-"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal break-words">{item.source_filename || "-"}</TableCell>
                  <TableCell>{item.failure_debug?.failed_stage || item.current_stage || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                  </TableCell>
                  <TableCell>{item.error_code || "-"}</TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal break-words">{item.message || "-"}</TableCell>
                  <TableCell className="max-w-[320px] whitespace-pre-wrap break-words">
                    {[
                      item.exception_type,
                      item.detail_excerpt,
                      item.last_progress_text ? `上一步：${item.last_progress_text}` : "",
                      formatTracebackPreview(item.traceback_excerpt) ? `堆栈：\n${formatTracebackPreview(item.traceback_excerpt)}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n") || "-"}
                  </TableCell>
                  <TableCell className="max-w-[320px] whitespace-pre-wrap break-words">{formatTranslationSummary(item.translation_debug_summary)}</TableCell>
                  <TableCell>{item.resume_available ? "可继续生成" : "不可继续"}</TableCell>
                  <TableCell>
                    {item.failure_debug ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setDetailItem(item)}>
                        查看详情
                      </Button>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">总计 {total} 条</p>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPage(1);
                setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / 页</SelectItem>
                <SelectItem value="20">20 / 页</SelectItem>
                <SelectItem value="50">50 / 页</SelectItem>
              </SelectContent>
            </Select>
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
        </div>

        {status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}

        <Dialog open={Boolean(detailItem)} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>生成失败详情</DialogTitle>
              <DialogDescription>
                {detailItem ? `${detailItem.task_id} · ${detailItem.source_filename || "-"}` : ""}
              </DialogDescription>
            </DialogHeader>
            {detailItem ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-3 text-sm">
                    <p>失败阶段：{detailItem.failure_debug?.failed_stage || "-"}</p>
                    <p>异常类型：{detailItem.exception_type || "-"}</p>
                    <p>错误码：{detailItem.error_code || "-"}</p>
                    <p>失败时间：{formatDateTimeBeijing(detailItem.failed_at || detailItem.updated_at || detailItem.created_at)}</p>
                  </div>
                  <div className="rounded-xl border p-3 text-sm whitespace-pre-wrap break-words space-y-2">
                    <p>{detailItem.detail_excerpt || detailItem.message || "-"}</p>
                    {detailItem.traceback_excerpt ? (
                      <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 text-xs">
                        {detailItem.traceback_excerpt}
                      </pre>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="mb-2 text-sm font-medium">完整调试载荷</p>
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs">
                    {JSON.stringify(detailItem.failure_debug, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
