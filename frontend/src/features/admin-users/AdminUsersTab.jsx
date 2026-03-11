import { Activity, ArrowUpDown, RefreshCcw, Trash2, UserRound, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
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

function formatPoints(points) {
  const value = Number(points || 0);
  return `${value >= 0 ? "" : "-"}${Math.abs(value)} 点`;
}

export function AdminUsersTab({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState(() => readStringParam(searchParams, "sort_by", "created_at") || "created_at");
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
        sort_by: sortBy,
        sort_dir: sortDir,
        keyword,
      }),
      { replace: true },
    );
  }, [keyword, page, pageSize, searchParams, setSearchParams, sortBy, sortDir]);

  async function loadUsers(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_dir: sortDir,
        keyword: keyword.trim(),
      });
      const resp = await apiCall(`/api/admin/users?${query.toString()}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminUsersTab",
            action: "加载用户列表",
            endpoint: "/api/admin/users",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载用户失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setUsers(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminUsersTab",
          action: "加载用户列表",
          endpoint: "/api/admin/users",
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
    } catch (error) {
      toast.error(`复制失败: ${String(error)}`);
    }
  }

  function resetFilters() {
    setKeyword("");
    setKeywordInput("");
    setPage(1);
    setPageSize(20);
    setSortBy("created_at");
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
      const resp = await apiCall(`/api/admin/users/${user.id}/summary`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminUsersTab",
            action: "加载用户摘要",
            endpoint: `/api/admin/users/${user.id}/summary`,
            method: "GET",
            meta: { user_id: user.id, user_email: user.email },
            fallbackMessage: "加载用户摘要失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        setSummaryOpen(false);
        return;
      }
      setSummaryData(data.summary || null);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminUsersTab",
          action: "加载用户摘要",
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
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
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
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
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
  const visibleBalancePoints = users.reduce((sum, item) => sum + Number(item.balance_points || 0), 0);
  const cards = summaryCards.length
    ? summaryCards
    : [
        { label: "匹配用户", value: total, hint: "当前关键词筛中的总用户数", tone: "info" },
        { label: "本页余额合计", value: visibleBalancePoints, hint: "仅统计当前页", tone: "success" },
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
        key: "created_at",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("created_at")}>
            注册时间
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "注册时间",
        render: (item) => formatDateTimeBeijing(item.created_at),
      },
      {
        key: "balance_points",
        header: (
          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("balance_points")}>
            余额
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        mobileLabel: "余额",
        render: (item) => <Badge variant={Number(item.balance_points || 0) > 0 ? "default" : "secondary"}>{formatPoints(item.balance_points)}</Badge>,
      },
      {
        key: "actions",
        header: "操作",
        render: (item) => (
          <ActionMenu
            label={`${item.email} 的操作`}
            items={[
              { key: "summary", label: "查看行为摘要", description: "看最近课程、30 天扣点与兑换情况", icon: Activity, onSelect: () => openSummary(item) },
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
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4" />
              用户与余额
            </CardTitle>
            <CardDescription>搜索、排序、调账、删除与行为追踪集中到一个入口，桌面表格和移动卡片保持同一套信息结构。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((item) => (
          <MetricCard
            key={item.label}
            icon={item.label.includes("余额") ? Wallet : UserRound}
            label={item.label}
            value={item.value}
            hint={item.hint}
            tone={item.tone || "default"}
            loading={loading && users.length === 0}
          />
        ))}
      </div>

      <FilterPanel
        title="用户筛选"
        description="关键词、排序和页大小统一放这里，列表页操作保持相同位置。"
        onSubmit={() => {
          setPage(1);
          setKeyword(keywordInput.trim());
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
        <Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="按邮箱搜索" className="rounded-xl" />
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">按注册时间</SelectItem>
            <SelectItem value="email">按邮箱</SelectItem>
            <SelectItem value="balance_points">按余额</SelectItem>
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
        mobileDescription={(item) => `注册于 ${formatDateTimeBeijing(item.created_at)}`}
        mobileFooter={(item) => `余额：${formatPoints(item.balance_points)}`}
        mobileActions={(item) => columns.find((column) => column.key === "actions")?.render(item)}
        emptyText="暂无用户数据"
        loading={loading}
        minWidth={940}
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
            <DialogTitle>用户最近行为摘要</DialogTitle>
            <DialogDescription>{summaryUser?.email || "-"}</DialogDescription>
          </DialogHeader>
          {summaryLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard icon={Activity} label="课程数" value={summaryData?.lesson_count ?? 0} hint="当前用户累计课程数" tone="info" />
                <MetricCard icon={Wallet} label="30 天扣点" value={formatPoints(summaryData?.consumed_points_30d ?? 0)} hint="近 30 天累计消耗" tone="warning" />
                <MetricCard icon={Wallet} label="30 天兑换" value={formatPoints(summaryData?.redeemed_points_30d ?? 0)} hint="近 30 天累计充值" tone="success" />
                <MetricCard icon={Activity} label="最近钱包事件" value={formatDateTimeBeijing(summaryData?.latest_wallet_event_at)} hint="最近一次余额变动" tone="default" />
              </div>
              <Card className="rounded-3xl border shadow-none">
                <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                  <p>最近创建课程：{formatDateTimeBeijing(summaryData?.latest_lesson_created_at)}</p>
                  <p>最近兑换：{formatDateTimeBeijing(summaryData?.latest_redeem_at)}</p>
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link to={`/admin/business?tab=users&panel=wallet&user_email=${encodeURIComponent(summaryUser?.email || "")}`}>查看余额流水</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/admin/business?tab=redeem&panel=audit&user_email=${encodeURIComponent(summaryUser?.email || "")}`}>查看兑换审计</Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
