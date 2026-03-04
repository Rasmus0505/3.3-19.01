import { ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

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

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function toDateTimeLocalString(date) {
  const value = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function AdminLogsTab({ apiCall }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [eventType, setEventType] = useState("all");
  const [dateFrom, setDateFrom] = useState(toDateTimeLocalString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(toDateTimeLocalString(new Date()));

  async function loadLogs() {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(page),
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
    loadLogs();
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
        <CardDescription>预扣 / 消费 / 退款 / 手工调账明细。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadLogs();
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
              <SelectItem value="refund">refund</SelectItem>
              <SelectItem value="manual_adjust">manual_adjust</SelectItem>
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button type="submit" variant="outline" disabled={loading}>
            查询
          </Button>
        </form>

        {loading ? <Skeleton className="h-10 w-full" /> : null}
        <Table className="min-w-[940px]">
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>变动</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>时长(ms)</TableHead>
              <TableHead>课程ID</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatDateTime(item.created_at)}</TableCell>
                <TableCell>{item.user_email}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.event_type === "refund"
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
                <TableCell>{item.note || "-"}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={9}>
                  暂无数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

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
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              下一页
            </Button>
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
