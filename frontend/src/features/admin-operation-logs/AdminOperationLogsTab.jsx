import { RefreshCcw, Shield } from "lucide-react";
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

export function AdminOperationLogsTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [operatorEmail, setOperatorEmail] = useState(() => readStringParam(searchParams, "operator_email"));
  const [actionType, setActionType] = useState(() => readStringParam(searchParams, "action_type", "all") || "all");
  const [targetType, setTargetType] = useState(() => readStringParam(searchParams, "target_type", "all") || "all");
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));

  useEffect(() => {
    setSearchParams(
      buildSearchParams({
        page,
        page_size: pageSize,
        operator_email: operatorEmail,
        action_type: actionType,
        target_type: targetType,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true }
    );
  }, [actionType, dateFrom, dateTo, operatorEmail, page, pageSize, setSearchParams, targetType]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        operator_email: operatorEmail.trim(),
        action_type: actionType,
        target_type: targetType,
      });
      const normalizedDateFrom = datetimeLocalToBeijingOffset(dateFrom);
      const normalizedDateTo = datetimeLocalToBeijingOffset(dateTo);
      if (normalizedDateFrom) query.set("date_from", normalizedDateFrom);
      if (normalizedDateTo) query.set("date_to", normalizedDateTo);
      const resp = await apiCall(`/api/admin/operation-logs?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载操作日志失败");
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
            <Shield className="size-4" />
            管理员操作日志
          </CardTitle>
          <CardDescription>记录费率修改、调账、兑换码状态调整等后台敏感动作，支持筛选和链接分享。</CardDescription>
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
          className="grid gap-2 md:grid-cols-3 xl:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadLogs(1);
          }}
        >
          <Input value={operatorEmail} onChange={(event) => setOperatorEmail(event.target.value)} placeholder="操作员邮箱" />
          <Input value={actionType === "all" ? "" : actionType} onChange={(event) => setActionType(event.target.value || "all")} placeholder="动作类型，如 manual_adjust" />
          <Input value={targetType === "all" ? "" : targetType} onChange={(event) => setTargetType(event.target.value || "all")} placeholder="对象类型，如 billing_rate" />
          <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button type="submit" variant="outline" disabled={loading}>
            查询
          </Button>
        </form>

        {loading ? <Skeleton className="h-10 w-full" /> : null}

        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[1560px]">
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>操作员</TableHead>
                <TableHead>动作</TableHead>
                <TableHead>对象</TableHead>
                <TableHead>对象 ID</TableHead>
                <TableHead>变更前</TableHead>
                <TableHead>变更后</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                  <TableCell>{item.operator_user_email || "-"}</TableCell>
                  <TableCell><Badge variant="outline">{item.action_type}</Badge></TableCell>
                  <TableCell>{item.target_type}</TableCell>
                  <TableCell>{item.target_id || "-"}</TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal break-words">{item.before_value || "-"}</TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal break-words">{item.after_value || "-"}</TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal break-words">{item.note || "-"}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
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
