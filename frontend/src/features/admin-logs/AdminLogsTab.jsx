import { CalendarDays, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { buildBeijingOffsetDateTime, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Calendar, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, Popover, PopoverContent, PopoverTrigger, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateOnlyString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTimeOnlyString(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function AdminLogsTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [eventType, setEventType] = useState("all");
  const [dateFromDate, setDateFromDate] = useState(sevenDaysAgo);
  const [dateToDate, setDateToDate] = useState(now);
  const [dateFromTime, setDateFromTime] = useState(toTimeOnlyString(sevenDaysAgo));
  const [dateToTime, setDateToTime] = useState(toTimeOnlyString(now));

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const dateFrom = buildBeijingOffsetDateTime(dateFromDate, dateFromTime);
      const dateTo = buildBeijingOffsetDateTime(dateToDate, dateToTime);

      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
        event_type: eventType,
      });
      if (dateFrom) query.set("date_from", dateFrom);
      if (dateTo) query.set("date_to", dateTo);
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

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4" />
          余额流水
        </CardTitle>
        <CardDescription>预扣 / ASR 扣点 / 翻译扣点 / 退款 / 手工调账 / 兑换码充值明细（筛选与展示均按北京时间）。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 md:grid-cols-7"
          onSubmit={(event) => {
            event.preventDefault();
            const fromValue = buildBeijingOffsetDateTime(dateFromDate, dateFromTime);
            const toValue = buildBeijingOffsetDateTime(dateToDate, dateToTime);
            if (fromValue && toValue && new Date(fromValue).getTime() > new Date(toValue).getTime()) {
              const message = "开始时间不能晚于结束时间";
              setStatus(message);
              toast.error(message);
              return;
            }
            if (page !== 1) {
              setPage(1);
              return;
            }
            loadLogs(1);
          }}
        >
          <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="用户邮箱" />
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

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFromDate && "text-muted-foreground")}>
                <CalendarDays className="size-4" />
                {dateFromDate ? toDateOnlyString(dateFromDate) : "开始日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFromDate} onSelect={(value) => value && setDateFromDate(value)} />
            </PopoverContent>
          </Popover>
          <Input type="time" step="60" value={dateFromTime} onChange={(e) => setDateFromTime(e.target.value)} />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !dateToDate && "text-muted-foreground")}>
                <CalendarDays className="size-4" />
                {dateToDate ? toDateOnlyString(dateToDate) : "结束日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateToDate} onSelect={(value) => value && setDateToDate(value)} />
            </PopoverContent>
          </Popover>
          <Input type="time" step="60" value={dateToTime} onChange={(e) => setDateToTime(e.target.value)} />

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
