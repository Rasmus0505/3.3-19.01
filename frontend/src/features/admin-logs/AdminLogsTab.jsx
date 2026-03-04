import { ScrollText } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select } from "../../shared/ui";

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
        setStatus(parseError(data, "加载流水失败"));
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
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
        <div className="grid gap-2 md:grid-cols-5">
          <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="用户邮箱" />
          <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="all">全部类型</option>
            <option value="reserve">reserve</option>
            <option value="consume">consume</option>
            <option value="refund">refund</option>
            <option value="manual_adjust">manual_adjust</option>
          </Select>
          <Input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              loadLogs();
            }}
            disabled={loading}
          >
            查询
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border border-input">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">用户</th>
                <th className="px-3 py-2 text-left">类型</th>
                <th className="px-3 py-2 text-left">变动</th>
                <th className="px-3 py-2 text-left">余额</th>
                <th className="px-3 py-2 text-left">模型</th>
                <th className="px-3 py-2 text-left">时长(ms)</th>
                <th className="px-3 py-2 text-left">课程ID</th>
                <th className="px-3 py-2 text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-input">
                  <td className="px-3 py-2">{formatDateTime(item.created_at)}</td>
                  <td className="px-3 py-2">{item.user_email}</td>
                  <td className="px-3 py-2">
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
                  </td>
                  <td className="px-3 py-2">{item.delta_points}</td>
                  <td className="px-3 py-2">{item.balance_after}</td>
                  <td className="px-3 py-2">{item.model_name || "-"}</td>
                  <td className="px-3 py-2">{item.duration_ms ?? "-"}</td>
                  <td className="px-3 py-2">{item.lesson_id ?? "-"}</td>
                  <td className="px-3 py-2">{item.note || "-"}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={9}>暂无数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">总计 {total} 条</p>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }} className="max-w-[120px]">
              <option value="10">10 / 页</option>
              <option value="20">20 / 页</option>
              <option value="50">50 / 页</option>
            </Select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="text-xs text-muted-foreground">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>

        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
