import { RefreshCcw, Shield } from "lucide-react";
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
  const [summaryCards, setSummaryCards] = useState([]);
  const [charts, setCharts] = useState([]);

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        operator_email: operatorEmail,
        action_type: actionType,
        target_type: targetType,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true },
    );
  }, [actionType, dateFrom, dateTo, operatorEmail, page, pageSize, searchParams, setSearchParams, targetType]);

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
    setOperatorEmail("");
    setActionType("all");
    setTargetType("all");
    setDateFrom(toLocalDatetimeValue(defaultFrom));
    setDateTo(toLocalDatetimeValue(now));
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo(
    () => [
      { key: "time", header: "时间", mobileLabel: "时间", render: (item) => formatDateTimeBeijing(item.created_at) },
      { key: "operator", header: "操作员", mobileLabel: "操作员", render: (item) => item.operator_user_email || "-" },
      { key: "action", header: "动作", mobileLabel: "动作", render: (item) => <Badge variant="outline">{item.action_type}</Badge> },
      { key: "target", header: "对象", mobileLabel: "对象", render: (item) => item.target_type },
      { key: "targetId", header: "对象 ID", mobileLabel: "对象 ID", render: (item) => item.target_id || "-" },
      { key: "note", header: "备注", mobileLabel: "备注", render: (item) => item.note || "-" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(summaryCards.length ? summaryCards : [{ label: "匹配日志", value: total, hint: "当前筛选结果", tone: "info" }]).map((item) => (
          <MetricCard key={item.label} icon={Shield} label={item.label} value={item.value} hint={item.hint} tone={item.tone || "default"} loading={loading && items.length === 0} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {charts.map((chart) => (
          <MetricChart key={chart.title} title={chart.title} description={chart.description} data={chart.data} series={chart.series} type={chart.type} xKey={chart.x_key} loading={loading && charts.length === 0} />
        ))}
      </div>

      <FilterPanel
        title="操作日志筛选"
        description="按操作员、动作、对象和时间范围追后台留痕，适合做敏感动作复盘。"
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
        <Input value={operatorEmail} onChange={(event) => setOperatorEmail(event.target.value)} placeholder="操作员邮箱" className="rounded-xl" />
        <Input value={actionType === "all" ? "" : actionType} onChange={(event) => setActionType(event.target.value || "all")} placeholder="动作类型，如 manual_adjust" className="rounded-xl" />
        <Input value={targetType === "all" ? "" : targetType} onChange={(event) => setTargetType(event.target.value || "all")} placeholder="对象类型，如 billing_rate" className="rounded-xl" />
        <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl" />
        <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl" />
      </FilterPanel>

      <ResponsiveTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        mobileTitle={(item) => item.action_type}
        mobileDescription={(item) => `${item.operator_user_email || "未知操作员"} · ${formatDateTimeBeijing(item.created_at)}`}
        mobileFooter={(item) => `${item.target_type} / ${item.target_id || "-"}`}
        emptyText="暂无操作日志"
        loading={loading}
        minWidth={1280}
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
