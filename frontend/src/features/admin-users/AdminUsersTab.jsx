import { Activity, RefreshCcw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

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

function formatPoints(points) {
  return `${Number(points || 0)} 点`;
}

export function AdminUsersTab({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keywordInput, setKeywordInput] = useState(() => readStringParam(searchParams, "keyword"));
  const [keyword, setKeyword] = useState(() => readStringParam(searchParams, "keyword"));
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState(() => readStringParam(searchParams, "sort_by", "created_at") || "created_at");
  const [sortDir, setSortDir] = useState(() => readStringParam(searchParams, "sort_dir", "desc") || "desc");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [adjustingUser, setAdjustingUser] = useState(null);
  const [deltaPoints, setDeltaPoints] = useState(0);
  const [reason, setReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [confirmAdjustOpen, setConfirmAdjustOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [summaryUser, setSummaryUser] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        keyword,
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
      }),
      { replace: true }
    );
  }, [keyword, page, pageSize, setSearchParams, sortBy, sortDir]);

  async function loadUsers() {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        keyword,
        page: String(page),
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      const resp = await apiCall(`/api/admin/users?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载用户失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setUsers(Array.isArray(data.items) ? data.items : []);
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
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, page, pageSize, sortBy, sortDir]);

  async function copyFilters() {
    try {
      await copyCurrentUrl();
      toast.success("已复制筛选链接");
    } catch (error) {
      toast.error(`复制失败: ${String(error)}`);
    }
  }

  async function openSummary(user) {
    setSummaryUser(user);
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryData(null);
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/users/${user.id}/summary`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载用户行为摘要失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setSummaryData(data.summary || null);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function submitAdjust() {
    if (!adjustingUser) return;
    setAdjustLoading(true);
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/users/${adjustingUser.id}/wallet-adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta_points: Number(deltaPoints), reason }),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "调账失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      const message = `调账成功：${adjustingUser.email}，余额 ${formatPoints(data.balance_points)}`;
      setStatus(message);
      toast.success(message);
      setAdjustingUser(null);
      setConfirmAdjustOpen(false);
      setDeltaPoints(0);
      setReason("");
      await loadUsers();
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setAdjustLoading(false);
    }
  }

  function openDeleteConfirm(user) {
    setDeletingUser(user);
    setConfirmDeleteOpen(true);
  }

  async function submitDelete() {
    if (!deletingUser) return false;
    setDeletingUserId(deletingUser.id);
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/users/${deletingUser.id}`, { method: "DELETE" });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "删除用户失败");
        setStatus(message);
        toast.error(message);
        return false;
      }

      if (adjustingUser?.id === deletingUser.id) {
        setAdjustingUser(null);
        setConfirmAdjustOpen(false);
        setDeltaPoints(0);
        setReason("");
      }
      if (summaryUser?.id === deletingUser.id) {
        setSummaryOpen(false);
        setSummaryUser(null);
        setSummaryData(null);
      }

      const failedCount = Array.isArray(data.file_cleanup_failed_dirs) ? data.file_cleanup_failed_dirs.length : 0;
      const message = `删除成功：${deletingUser.email}，课程 ${Number(data.deleted_lessons || 0)}，流水 ${Number(data.deleted_ledger_rows || 0)}，操作员引用清理 ${Number(data.cleared_operator_refs || 0)}，文件清理失败 ${failedCount}`;
      setStatus(message);
      toast.success(message);
      setConfirmDeleteOpen(false);
      setDeletingUser(null);

      if (users.length <= 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadUsers();
      }
      return true;
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
      return false;
    } finally {
      setDeletingUserId(null);
    }
  }

  function toggleSort(nextSortBy) {
    if (sortBy === nextSortBy) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortBy(nextSortBy);
    setSortDir("desc");
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            用户与余额
          </CardTitle>
          <CardDescription>搜索、分页、排序、手工调账，并支持查看用户最近行为摘要。</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyFilters}>
            复制筛选链接
          </Button>
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setKeyword(keywordInput.trim());
          }}
        >
          <Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="按邮箱搜索" className="max-w-xs" />
          <Button type="submit" variant="outline">
            查询
          </Button>
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
        </form>

        {loading ? <Skeleton className="h-10 w-full" /> : null}
        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[940px]">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("email")}>
                    邮箱 {sortBy === "email" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("created_at")}>
                    注册时间 {sortBy === "created_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("balance_points")}>
                    余额 {sortBy === "balance_points" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHead>
                <TableHead className="w-[320px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                  <TableCell>{formatPoints(item.balance_points)}</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openSummary(item)}>
                      <Activity className="size-4" />
                      行为摘要
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAdjustingUser(item)}>
                      调账
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openDeleteConfirm(item)} disabled={deletingUserId === item.id}>
                      {deletingUserId === item.id ? "删除中..." : "删除"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    暂无用户数据
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex items-center justify-between">
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

        <Dialog open={Boolean(adjustingUser)} onOpenChange={(open) => { if (!open) setAdjustingUser(null); }}>
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
              <Button variant="outline" onClick={() => setAdjustingUser(null)}>取消</Button>
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
              <AlertDialogAction onClick={submitAdjust}>确认提交</AlertDialogAction>
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
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs text-muted-foreground">课程数</p>
                      <p className="text-xl font-semibold">{summaryData?.lesson_count ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs text-muted-foreground">30 天扣点</p>
                      <p className="text-xl font-semibold">{formatPoints(summaryData?.consumed_points_30d ?? 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs text-muted-foreground">30 天兑换入账</p>
                      <p className="text-xl font-semibold">{formatPoints(summaryData?.redeemed_points_30d ?? 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs text-muted-foreground">最近钱包事件</p>
                      <p className="text-sm">{formatDateTimeBeijing(summaryData?.latest_wallet_event_at)}</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-2 rounded-md border p-4 text-sm">
                  <p>最近创建课程：{formatDateTimeBeijing(summaryData?.latest_lesson_created_at)}</p>
                  <p>最近兑换：{formatDateTimeBeijing(summaryData?.latest_redeem_at)}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" asChild>
                <Link to={`/admin/users?tab=wallet&user_email=${encodeURIComponent(summaryUser?.email || "")}`}>查看余额流水</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/admin/redeem?tab=audit&user_email=${encodeURIComponent(summaryUser?.email || "")}`}>查看兑换审计</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
