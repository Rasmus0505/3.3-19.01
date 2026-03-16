import { Activity, ArrowUpDown, CalendarDays, RefreshCcw, Trash2, UserRound, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  ActionMenu,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterPanel,
  Input,
  Label,
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
  Skeleton,
} from "../../shared/ui";

function toDateValue(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildDayRange(dateValue) {
  if (!dateValue) return { dateFrom: "", dateTo: "" };
  return {
    dateFrom: datetimeLocalToBeijingOffset(`${dateValue}T00:00`),
    dateTo: datetimeLocalToBeijingOffset(`${dateValue}T23:59`),
  };
}

function buildRangeBounds(mode, singleDate, rangeStart, rangeEnd) {
  if (mode === "single") {
    return buildDayRange(singleDate);
  }
  return {
    dateFrom: rangeStart ? datetimeLocalToBeijingOffset(`${rangeStart}T00:00`) : "",
    dateTo: rangeEnd ? datetimeLocalToBeijingOffset(`${rangeEnd}T23:59`) : "",
  };
}

function formatPoints(points) {
  const value = Number(points || 0);
  return `${value >= 0 ? "" : "-"}${Math.abs(value)} 点`;
}

function formatRangeText(mode, singleDate, rangeStart, rangeEnd) {
  if (mode === "single") return singleDate || "-";
  if (rangeStart && rangeEnd) return `${rangeStart} 至 ${rangeEnd}`;
  return "-";
}

export function AdminUsersTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultSingleDate = toDateValue(now);
  const defaultRangeEnd = toDateValue(now);
  const defaultRangeStart = toDateValue(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [charts, setCharts] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState(() => readStringParam(searchParams, "mode", "range") || "range");
  const [singleDate, setSingleDate] = useState(() => readStringParam(searchParams, "date", defaultSingleDate) || defaultSingleDate);
  const [rangeStart, setRangeStart] = useState(() => readStringParam(searchParams, "date_from_day", defaultRangeStart) || defaultRangeStart);
  const [rangeEnd, setRangeEnd] = useState(() => readStringParam(searchParams, "date_to_day", defaultRangeEnd) || defaultRangeEnd);
  const [sortBy, setSortBy] = useState(() => readStringParam(searchParams, "sort_by", "login_events") || "login_events");
  const [sortDir, setSortDir] = useState(() => readStringParam(searchParams, "sort_dir", "desc") || "desc");
  const [keywordInput, setKeywordInput] = useState(() => readStringParam(searchParams, "keyword"));
  const [keyword, setKeyword] = useState(() => readStringParam(searchParams, "keyword"));
  const [summaryCards, setSummaryCards] = useState([]);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryUser, setSummaryUser] = useState(null);

  const [adjustingUser, setAdjustingUser] = useState(null);
  const [deltaPoints, setDeltaPoints] = useState(0);
  const [reason, setReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [confirmAdjustOpen, setConfirmAdjustOpen] = useState(false);

  const [deletingUser, setDeletingUser] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { error, clearError, captureError } = useErrorHandler();

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        mode,
        date: mode === "single" ? singleDate : null,
        date_from_day: mode === "range" ? rangeStart : null,
        date_to_day: mode === "range" ? rangeEnd : null,
        sort_by: sortBy,
        sort_dir: sortDir,
        keyword,
      }),
      { replace: true },
    );
  }, [keyword, mode, page, pageSize, rangeEnd, rangeStart, searchParams, setSearchParams, singleDate, sortBy, sortDir]);

  function buildActivityQuery(nextPage = page) {
    const query = new URLSearchParams({
      page: String(nextPage),
      page_size: String(pageSize),
      sort_by: sortBy,
      sort_dir: sortDir,
      keyword: keyword.trim(),
    });
    const { dateFrom, dateTo } = buildRangeBounds(mode, singleDate, rangeStart, rangeEnd);
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    return query;
  }

  async function loadUsers(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = buildActivityQuery(nextPage);
      const resp = await apiCall(`/api/admin/user-activity?${query.toString()}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminUsersTab",
            action: "加载用户活跃列表",
            endpoint: "/api/admin/user-activity",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载用户活跃失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setUsers(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
      setCharts(Array.isArray(data.charts) ? data.charts : []);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminUsersTab",
          action: "加载用户活跃列表",
          endpoint: "/api/admin/user-activity",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, sortDir]);

  async function copyFilters() {
    try {
      await copyCurrentUrl();
      toast.success("已复制筛选链接");
    } catch (requestError) {
      toast.error(`复制失败: ${String(requestError)}`);
    }
  }

  function resetFilters() {
    setMode("range");
    setSingleDate(defaultSingleDate);
    setRangeStart(defaultRangeStart);
    setRangeEnd(defaultRangeEnd);
    setKeyword("");
    setKeywordInput("");
    setPage(1);
    setPageSize(20);
    setSortBy("login_events");
    setSortDir("desc");
  }

  function toggleSort(nextSortBy) {
    setPage(1);
    if (sortBy === nextSortBy) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSortBy);
    setSortDir(nextSortBy === "email" ? "asc" : "desc");
  }

  async function openSummary(user) {
    setSummaryUser(user);
    setSummaryOpen(true);
    setSummaryLoading(true);
    clearError();
    try {
      const query = new URLSearchParams();
      const { dateFrom, dateTo } = buildRangeBounds(mode, singleDate, rangeStart, rangeEnd);
      if (dateFrom) query.set("date_from", dateFrom);
      if (dateTo) query.set("date_to", dateTo);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const resp = await apiCall(`/api/admin/users/${user.id}/summary${suffix}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminUsersTab",
            action: "加载用户活跃摘要",
            endpoint: `/api/admin/users/${user.id}/summary`,
            method: "GET",
            meta: { user_id: user.id, user_email: user.email, date_from: dateFrom, date_to: dateTo },
            fallbackMessage: "加载用户摘要失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        setSummaryOpen(false);
        return;
      }
      setSummaryData(data.summary || null);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminUsersTab",
          action: "加载用户活跃摘要",
          endpoint: `/api/admin/users/${user.id}/summary`,
          method: "GET",
          meta: { user_id: user.id, user_email: user.email },
        }),
      );
      setStatus(formattedError.displayMessage);
      setSummaryOpen(false);
    } finally {
      setSummaryLoading(false);
    }
  }

  function openAdjustDialog(user) {
    setAdjustingUser(user);
    setDeltaPoints(0);
    setReason("");
  }

  async function submitAdjust() {
    if (!adjustingUser) return;
    setAdjustLoading(true);
    clearError();
    try {
      const resp = await apiCall(`/api/admin/users/${adjustingUser.id}/wallet-adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta_points: Number(deltaPoints), reason: reason.trim() }),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminUsersTab",
            action: "余额调账",
            endpoint: `/api/admin/users/${adjustingUser.id}/wallet-adjust`,
            method: "POST",
            meta: { user_id: adjustingUser.id, user_email: adjustingUser.email, delta_points: Number(deltaPoints), reason: reason.trim() },
            fallbackMessage: "调账失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      toast.success(`调账成功：${adjustingUser.email}，余额 ${formatPoints(data.balance_points)}`);
      setConfirmAdjustOpen(false);
      setAdjustingUser(null);
      loadUsers(page);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminUsersTab",
          action: "余额调账",
          endpoint: `/api/admin/users/${adjustingUser.id}/wallet-adjust`,
          method: "POST",
          meta: { user_id: adjustingUser.id, user_email: adjustingUser.email },
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setAdjustLoading(false);
    }
  }

  function openDeleteConfirm(user) {
    setDeletingUser(user);
    setConfirmDeleteOpen(true);
  }

  async function submitDelete() {
    if (!deletingUser) return;
    setDeletingUserId(deletingUser.id);
    clearError();
    try {
      const resp = await apiCall(`/api/admin/users/${deletingUser.id}`, { method: "DELETE" });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminUsersTab",
            action: "删除用户",
            endpoint: `/api/admin/users/${deletingUser.id}`,
            method: "DELETE",
            meta: { user_id: deletingUser.id, user_email: deletingUser.email },
            fallbackMessage: "删除用户失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      const failedCount = Array.isArray(data.file_cleanup_failed_dirs) ? data.file_cleanup_failed_dirs.length : 0;
      toast.success(
        `删除成功：${deletingUser.email}，课程 ${Number(data.deleted_lessons || 0)}，流水 ${Number(data.deleted_ledger_rows || 0)}，文件清理失败 ${failedCount}`,
      );
      if (summaryUser?.id === deletingUser.id) {
        setSummaryOpen(false);
        setSummaryUser(null);
        setSummaryData(null);
      }
      setConfirmDeleteOpen(false);
      setDeletingUser(null);
      setPage(1);
      loadUsers(1);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminUsersTab",
          action: "删除用户",
          endpoint: `/api/admin/users/${deletingUser.id}`,
          method: "DELETE",
          meta: { user_id: deletingUser.id, user_email: deletingUser.email },
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setDeletingUserId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeText = formatRangeText(mode, singleDate, rangeStart, rangeEnd);
  const cards = summaryCards.length
    ? summaryCards
    : [
        { label: "活跃用户", value: total, hint: "当前时间范围内至少登录一次的用户数", tone: "info" },
        { label: "当前页登录次数", value: users.reduce((sum, item) => sum + Number(item.login_events || 0), 0), hint: "仅统计当前页", tone: "default" },
      ];

  const columns = useMemo(
    () => [
      {
        key: "email",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("email")}>
            邮箱
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "邮箱",
        render: (item) => item.email,
      },
      {
        key: "last_login_at",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("last_login_at")}>
            最近登录
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "最近登录",
        render: (item) => formatDateTimeBeijing(item.last_login_at),
      },
      {
        key: "login_days",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("login_days")}>
            登录天数
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "登录天数",
        render: (item) => `${Number(item.login_days || 0)} 天`,
      },
      {
        key: "login_events",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("login_events")}>
            登录次数
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "登录次数",
        render: (item) => Number(item.login_events || 0),
      },
      {
        key: "lessons_created",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("lessons_created")}>
            新建课程
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "新建课程",
        render: (item) => Number(item.lessons_created || 0),
      },
      {
        key: "consumed_points",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("consumed_points")}>
            区间消耗
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "区间消耗",
        render: (item) => `${Number(item.consumed_points || 0)} 点`,
      },
      {
        key: "balance_points",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("balance_points")}>
            当前余额
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "当前余额",
        render: (item) => <Badge variant={Number(item.balance_points || 0) > 0 ? "default" : "secondary"}>{formatPoints(item.balance_points)}</Badge>,
      },
      {
        key: "actions",
        header: "操作",
        render: (item) => (
          <ActionMenu
            label={`${item.email} 的操作`}
            items={[
              { key: "summary", label: "查看活跃摘要", description: "看选定时间范围内的登录和业务行为", icon: Activity, onSelect: () => openSummary(item) },
              { key: "adjust", label: "余额调账", description: "手工加减点数并记录原因", icon: Wallet, onSelect: () => openAdjustDialog(item) },
              { key: "delete", label: deletingUserId === item.id ? "删除中..." : "删除用户", description: "删除账号、课程和流水，操作不可恢复", icon: Trash2, variant: "destructive", disabled: deletingUserId === item.id, onSelect: () => openDeleteConfirm(item) },
            ]}
          />
        ),
      },
    ],
    [deletingUserId, sortBy, sortDir],
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{mode === "single" ? "指定日期" : "指定范围"}</Badge>
              <Badge variant="outline">{rangeText}</Badge>
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4" />
                用户活跃与用户操作
              </CardTitle>
              <CardDescription>活跃口径按成功登录统计，支持指定日期和范围切换。下方用户列表继续保留查看摘要、余额调账和删除用户三个管理员动作。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "single" ? "default" : "outline"} size="sm" onClick={() => setMode("single")}>
              <CalendarDays className="size-4" />
              指定日期
            </Button>
            <Button variant={mode === "range" ? "default" : "outline"} size="sm" onClick={() => setMode("range")}>
              <CalendarDays className="size-4" />
              指定范围
            </Button>
            <Button variant="outline" size="sm" onClick={copyFilters}>
              复制筛选链接
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadUsers(page)} disabled={loading}>
              <RefreshCcw className="size-4" />
              刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => (
          <MetricCard
            key={item.label}
            icon={item.label.includes("消耗") || item.label.includes("余额") ? Wallet : Activity}
            label={item.label}
            value={item.value}
            hint={item.hint}
            tone={item.tone || "default"}
            loading={loading && users.length === 0}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-1">
        {charts.map((chart) => (
          <MetricChart
            key={chart.title}
            title={chart.title}
            description={chart.description}
            data={chart.data}
            series={chart.series}
            type={chart.type}
            xKey={chart.x_key}
            loading={loading && charts.length === 0}
          />
        ))}
      </div>

      <FilterPanel
        title="活跃筛选"
        description="先选统计口径和时间范围，再按关键词、排序和页大小筛出要操作的用户。"
        onSubmit={() => {
          setPage(1);
          setKeyword(keywordInput.trim());
          loadUsers(1);
        }}
        onReset={resetFilters}
        actions={
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
        }
      >
        {mode === "single" ? (
          <Input type="date" value={singleDate} onChange={(event) => setSingleDate(event.target.value)} className="rounded-xl" />
        ) : (
          <>
            <Input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="rounded-xl" />
            <Input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="rounded-xl" />
          </>
        )}
        <Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="按邮箱搜索" className="rounded-xl" />
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="login_events">按登录次数</SelectItem>
            <SelectItem value="last_login_at">按最近登录</SelectItem>
            <SelectItem value="login_days">按登录天数</SelectItem>
            <SelectItem value="created_at">按注册时间</SelectItem>
            <SelectItem value="balance_points">按余额</SelectItem>
            <SelectItem value="email">按邮箱</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={setSortDir}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">降序</SelectItem>
            <SelectItem value="asc">升序</SelectItem>
          </SelectContent>
        </Select>
      </FilterPanel>

      <ResponsiveTable
        columns={columns}
        data={users}
        getRowKey={(item) => item.id}
        mobileTitle={(item) => item.email}
        mobileDescription={(item) => `最近登录 ${formatDateTimeBeijing(item.last_login_at)}`}
        mobileFooter={(item) => `登录 ${Number(item.login_events || 0)} 次，余额 ${formatPoints(item.balance_points)}`}
        mobileActions={(item) => columns.find((column) => column.key === "actions")?.render(item)}
        emptyText="当前时间范围内暂无活跃用户"
        loading={loading}
        minWidth={1540}
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

      <Dialog open={Boolean(adjustingUser)} onOpenChange={(open) => !open && setAdjustingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>余额调账</DialogTitle>
            <DialogDescription>调账用户：{adjustingUser?.email || "-"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>变动点数（可负数）</Label>
              <Input type="number" value={deltaPoints} onChange={(event) => setDeltaPoints(Number(event.target.value || 0))} />
            </div>
            <div className="space-y-2">
              <Label>原因</Label>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：线下充值 1000 点" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustingUser(null)}>
              取消
            </Button>
            <Button onClick={() => setConfirmAdjustOpen(true)} disabled={adjustLoading || !reason.trim()}>
              {adjustLoading ? "提交中..." : "下一步确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAdjustOpen} onOpenChange={setConfirmAdjustOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认提交调账？</AlertDialogTitle>
            <AlertDialogDescription>
              {adjustingUser?.email || "-"} 将变动 {formatPoints(deltaPoints)}，原因：{reason || "-"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回修改</AlertDialogCancel>
            <AlertDialogAction onClick={submitAdjust}>{adjustLoading ? "提交中..." : "确认提交"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户？</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">用户：{deletingUser?.email || "-"}</span>
              <span className="block">该操作会删除账号、课程、余额账户和流水，且不可恢复。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={submitDelete}>{deletingUserId ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>用户活跃摘要</DialogTitle>
            <DialogDescription>
              {summaryUser?.email || "-"} · {rangeText}
            </DialogDescription>
          </DialogHeader>
          {summaryLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard icon={Activity} label="登录天数" value={summaryData?.login_days_in_range ?? 0} hint="选定范围内至少登录过的天数" tone="info" />
                <MetricCard icon={Activity} label="登录次数" value={summaryData?.login_events_in_range ?? 0} hint="选定范围内累计登录次数" tone="default" />
                <MetricCard icon={Activity} label="区间新建课程" value={summaryData?.lessons_created_in_range ?? 0} hint="同范围内创建的课程数" tone="warning" />
                <MetricCard icon={Wallet} label="区间消耗点数" value={`${summaryData?.consumed_points_in_range ?? 0} 点`} hint="当前范围内转写与翻译消耗" tone="warning" />
                <MetricCard icon={Wallet} label="区间兑换点数" value={`${summaryData?.redeemed_points_in_range ?? 0} 点`} hint="当前范围内兑换入账" tone="success" />
                <MetricCard icon={Wallet} label="当前总课程数" value={summaryData?.lesson_count ?? 0} hint="用户累计课程数" tone="default" />
              </div>
              <Card className="rounded-3xl border shadow-none">
                <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                  <p>最近登录：{formatDateTimeBeijing(summaryData?.latest_login_at)}</p>
                  <p>最近创建课程：{formatDateTimeBeijing(summaryData?.latest_lesson_created_at)}</p>
                  <p>最近钱包事件：{formatDateTimeBeijing(summaryData?.latest_wallet_event_at)}</p>
                  <p>最近兑换：{formatDateTimeBeijing(summaryData?.latest_redeem_at)}</p>
                  <p>近 30 天扣点：{summaryData?.consumed_points_30d ?? 0} 点</p>
                  <p>近 30 天兑换：{summaryData?.redeemed_points_30d ?? 0} 点</p>
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link to={`/admin/users?panel=wallet&user_email=${encodeURIComponent(summaryUser?.email || "")}`}>查看余额流水</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/admin/redeem?panel=audit&user_email=${encodeURIComponent(summaryUser?.email || "")}`}>查看兑换审计</Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
