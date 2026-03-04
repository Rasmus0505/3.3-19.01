import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatPoints(points) {
  return `${Number(points || 0)} 点`;
}

export function AdminUsersTab({ apiCall }) {
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
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
      const resp = await apiCall(`/api/admin/users/${deletingUser.id}`, {
        method: "DELETE",
      });
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          用户与余额
        </CardTitle>
        <CardDescription>搜索、分页、排序与手工调账。</CardDescription>
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
          <Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="按邮箱搜索" className="max-w-xs" />
          <Button type="submit" variant="outline">
            查询
          </Button>
          <Button type="button" variant="ghost" onClick={loadUsers} disabled={loading}>
            刷新
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
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleSort("email")}>
                    邮箱
                  </Button>
                </TableHead>
                <TableHead>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleSort("balance_points")}>
                    余额
                  </Button>
                </TableHead>
                <TableHead>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleSort("created_at")}>
                    创建时间
                  </Button>
                </TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{formatPoints(item.balance_points)}</TableCell>
                  <TableCell>{formatDateTime(item.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deletingUserId === item.id}
                        onClick={() => {
                          setAdjustingUser(item);
                          setDeltaPoints(0);
                          setReason("");
                          setConfirmAdjustOpen(false);
                        }}
                      >
                        调账
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deletingUserId === item.id}
                        onClick={() => openDeleteConfirm(item)}
                      >
                        {deletingUserId === item.id ? "删除中..." : "删除"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    暂无数据
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

        <Dialog
          open={Boolean(adjustingUser)}
          onOpenChange={(open) => {
            if (open) return;
            setAdjustingUser(null);
            setConfirmAdjustOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>余额调账</DialogTitle>
              <DialogDescription>调账用户：{adjustingUser?.email || "-"}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="delta-points">增减点数（可负数）</Label>
                <Input
                  id="delta-points"
                  type="number"
                  value={deltaPoints}
                  onChange={(e) => setDeltaPoints(Number(e.target.value || 0))}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="adjust-reason">备注（必填）</Label>
                <Input
                  id="adjust-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：线下充值 1000 点"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAdjustingUser(null)}>
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
                <span className="block">用户：{adjustingUser?.email || "-"}</span>
                <span className="block">点数变动：{Number(deltaPoints || 0)} 点</span>
                <span className="block">备注：{reason || "-"}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>返回修改</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await submitAdjust();
                  setConfirmAdjustOpen(false);
                }}
              >
                确认提交
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={confirmDeleteOpen}
          onOpenChange={(open) => {
            setConfirmDeleteOpen(open);
            if (!open && !deletingUserId) {
              setDeletingUser(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除用户？</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="block">用户：{deletingUser?.email || "-"}</span>
                <span className="block">该操作会删除账号、课程、余额账户和流水，且不可恢复。</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(deletingUserId)}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={async (event) => {
                  event.preventDefault();
                  await submitDelete();
                }}
                disabled={Boolean(deletingUserId)}
              >
                {deletingUserId ? "删除中..." : "确认删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
