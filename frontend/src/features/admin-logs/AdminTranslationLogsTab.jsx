import { RefreshCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

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
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
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
      { replace: true }
    );
  }, [dateFrom, dateTo, lessonId, page, pageSize, setSearchParams, success, taskId, userEmail]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
        task_id: taskId.trim(),
        success,
      });
      const normalizedLessonId = lessonId.trim();
      if (normalizedLessonId) query.set("lesson_id", normalizedLessonId);
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
            <Sparkles className="size-4" />
            翻译日志
          </CardTitle>
          <CardDescription>按用户、任务、课程、成功状态和时间范围筛选翻译请求，快速定位翻译失败。</CardDescription>
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
          className="grid gap-2 md:grid-cols-4 xl:grid-cols-7"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadLogs(1);
          }}
        >
          <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="用户邮箱" />
          <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="任务ID" />
          <Input value={lessonId} onChange={(event) => setLessonId(event.target.value)} placeholder="课程ID" />
          <Select value={success} onValueChange={setSuccess}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部结果</SelectItem>
              <SelectItem value="true">成功</SelectItem>
              <SelectItem value="false">失败</SelectItem>
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button type="submit" variant="outline" disabled={loading}>
            查询
          </Button>
        </form>

        {loading ? <Skeleton className="h-10 w-full" /> : null}

        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[1680px]">
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>任务</TableHead>
                <TableHead>课程/句子</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>状态码</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>请求预览</TableHead>
                <TableHead>错误信息</TableHead>
                <TableHead>Provider Request ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                  <TableCell>{item.user_email || "-"}</TableCell>
                  <TableCell>{item.task_id || "-"}</TableCell>
                  <TableCell>
                    {item.lesson_id ?? "-"} / {item.sentence_idx}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p>{item.model_name}</p>
                      <p className="text-xs text-muted-foreground">{item.provider}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.success ? "default" : "destructive"}>{item.success ? "成功" : "失败"}</Badge>
                  </TableCell>
                  <TableCell>{item.status_code ?? "-"}</TableCell>
                  <TableCell>{item.total_tokens}</TableCell>
                  <TableCell className="max-w-[360px] whitespace-normal break-words">{item.input_text_preview || "-"}</TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal break-words">{item.error_message || "-"}</TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal break-words">{item.provider_request_id || "-"}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">
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
      </CardContent>
    </Card>
  );
}
