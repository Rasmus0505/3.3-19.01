import { RefreshCcw, ScrollText, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { formatAmountByUnit } from "../../shared/lib/money";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
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

function toLocalDatetimeValue(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAmount(item, rawValue) {
  const value = Number(rawValue || 0);
  const rendered = formatAmountByUnit(value, item?.amount_unit || "cents");
  return `${value >= 0 ? "+" : "-"}${rendered.replace(/^[+-]/, "")}`;
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
  const [summaryCards, setSummaryCards] = useState([]);
  const [charts, setCharts] = useState([]);
  const { error, clearError, captureError } = useErrorHandler();

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        user_email: userEmail,
        event_type: eventType,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true },
    );
  }, [dateFrom, dateTo, eventType, page, pageSize, searchParams, setSearchParams, userEmail]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
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
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminLogsTab",
            action: "加载余额流水",
            endpoint: "/api/admin/wallet-logs",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载流水失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
      setCharts(Array.isArray(data.charts) ? data.charts : []);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminLogsTab",
          action: "加载余额流水",
          endpoint: "/api/admin/wallet-logs",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
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
    setEventType("all");
    setDateFrom(toLocalDatetimeValue(defaultFrom));
    setDateTo(toLocalDatetimeValue(now));
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo(
    () => [
      { key: "time", header: "时间", mobileLabel: "时间", render: (item) => formatDateTimeBeijing(item.created_at) },
      { key: "user", header: "用户", mobileLabel: "用户", render: (item) => item.user_email || "-" },
      { key: "event", header: "类型", mobileLabel: "类型", render: (item) => <Badge variant="outline">{item.event_type}</Badge> },
      { key: "delta", header: "变动", mobileLabel: "变动", render: (item) => <span className={Number(item.delta_points) >= 0 ? "text-emerald-600" : "text-amber-600"}>{formatAmount(item, item.delta_amount_cents ?? item.delta_points)}</span> },
      { key: "balance", header: "变动后余额", mobileLabel: "变动后余额", render: (item) => formatAmountByUnit(item.balance_after_amount_cents ?? item.balance_after, item.amount_unit || "cents") },
      { key: "note", header: "备注", mobileLabel: "备注", render: (item) => item.note || "-" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(summaryCards.length ? summaryCards : [{ label: "匹配流水", value: total, hint: "当前筛选结果", tone: "info" }]).map((item) => (
          <MetricCard key={item.label} icon={Wallet} label={item.label} value={String(item.label || "").includes("金额") ? formatAmountByUnit(item.value, "cents") : item.value} hint={item.hint} tone={item.tone || "default"} loading={loading && items.length === 0} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {charts.map((chart) => (
          <MetricChart key={chart.title} title={chart.title} description={chart.description} data={chart.data} series={chart.series} type={chart.type} xKey={chart.x_key} loading={loading && charts.length === 0} />
        ))}
      </div>

      <FilterPanel
        title="余额流水筛选"
        description="同一套筛选面板支持关键词、类型、时间范围和页大小，便于复制链接给同事复盘。"
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
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="redeem_code">兑换入账</SelectItem>
            <SelectItem value="consume">转写扣费</SelectItem>
            <SelectItem value="consume_translate">翻译扣费</SelectItem>
            <SelectItem value="manual_adjust">手工调账</SelectItem>
          </SelectContent>
        </Select>
        <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl" />
        <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl" />
      </FilterPanel>

      <ResponsiveTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        mobileTitle={(item) => item.user_email || "未知用户"}
        mobileDescription={(item) => `${item.event_type} · ${formatDateTimeBeijing(item.created_at)}`}
        mobileFooter={(item) => `${formatAmount(item, item.delta_amount_cents ?? item.delta_points)}，变动后 ${formatAmountByUnit(item.balance_after_amount_cents ?? item.balance_after, item.amount_unit || "cents")}`}
        emptyText="暂无流水数据"
        loading={loading}
        minWidth={1120}
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

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{status}</div>
      ) : null}
    </div>
  );
}
