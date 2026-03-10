import { RefreshCcw, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { buildSearchParams, copyCurrentUrl, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
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

export function AdminLogsTab({ apiCall }) {
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
  const [eventType, setEventType] = useState(() => readStringParam(searchParams, "event_type", "all") || "all");
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));

  useEffect(() => {
    setSearchParams(
      buildSearchParams({
        page,
        page_size: pageSize,
        user_email: userEmail,
        event_type: eventType,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true }
    );
  }, [dateFrom, dateTo, eventType, page, pageSize, setSearchParams, userEmail]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
        event_type: eventType,
      });
      const normalizedDateFrom = datetimeLocalToBeijingOffset(dateFrom);
      const normalizedDateTo = datetimeLocalToBeijingOffset(dateTo);
      if (normalizedDateFrom) query.set("date_from", normalizedDateFrom);
      if (normalizedDateTo) query.set("date_to", normalizedDateTo);
      const resp = await apiCall(`/api/admin/wallet-logs?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载流水失败");
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
            <ScrollText className="size-4" />
            余额流水
          </CardTitle>
          <CardDescription>预扣 / ASR 扣点 / 翻译扣点 / 退款 / 手工调账 / 兑换码充值明细（筛选与展示均按北京时间）。</CardDescription>
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
          className="grid gap-2 md:grid-cols-4 xl:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadLogs(1);
          }}
        >
          <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="用户邮箱" />
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="reserve">reserve</SelectItem>
              <SelectItem value="consume">consume</SelectItem>
              <SelectItem value="consume_translate">consume_translate</SelectItem>
              <SelectItem value="refund">refund</SelectItem>
              <SelectItem value="refund_translate">refund_translate</SelectItem>
              <SelectItem value="manual_adjust">manual_adjust</SelectItem>
              <SelectItem value="redeem_code">redeem_code</SelectItem>
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
          <Table className="min-w-[1160px]">
            <TableHeader>
              <TableRow>
                <TableHead>时间（北京时间）</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>变动</TableHead>
                <TableHead>余额</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>时长(ms)</TableHead>
                <TableHead>课程ID</TableHead>
                <TableHead>兑换批次ID</TableHead>
                <TableHead>兑换码</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                  <TableCell>{item.user_email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.event_type === "refund" || item.event_type === "refund_translate"
                          ? "secondary"
                          : item.event_type === "manual_adjust"
                            ? "outline"
                            : "default"
                      }
                    >
                      {item.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.delta_points}</TableCell>
                  <TableCell>{item.balance_after}</TableCell>
                  <TableCell>{item.model_name || "-"}</TableCell>
                  <TableCell>{item.duration_ms ?? "-"}</TableCell>
                  <TableCell>{item.lesson_id ?? "-"}</TableCell>
                  <TableCell>{item.redeem_batch_id ?? "-"}</TableCell>
                  <TableCell>{item.redeem_code_mask || "-"}</TableCell>
                  <TableCell>{item.note || "-"}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={11}>
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
