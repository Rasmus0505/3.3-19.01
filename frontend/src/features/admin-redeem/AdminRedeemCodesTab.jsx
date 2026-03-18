import { Download, RefreshCcw, ShieldBan, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeScopedSearchParams, readScopedIntParam, readScopedStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { formatMoneyCents } from "../../shared/lib/money";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, MetricCard, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

function fileNameFromDisposition(disposition, fallback) {
  const match = String(disposition || "").match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
  const raw = match?.[1] || match?.[2];
  return raw ? decodeURIComponent(raw) : fallback;
}

export function AdminRedeemCodesTab({ apiCall, queryPrefix = "" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [summaryCards, setSummaryCards] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => readScopedIntParam(searchParams, queryPrefix, "page", 1, { min: 1, max: Number.MAX_SAFE_INTEGER }));
  const [pageSize, setPageSize] = useState(() => readScopedIntParam(searchParams, queryPrefix, "page_size", 20, { min: 1, max: 100 }));

  const [batchId, setBatchId] = useState(() => readScopedStringParam(searchParams, queryPrefix, "batch_id"));
  const [statusFilter, setStatusFilter] = useState(() => readScopedStringParam(searchParams, queryPrefix, "status", "all") || "all");
  const [redeemUserEmail, setRedeemUserEmail] = useState(() => readScopedStringParam(searchParams, queryPrefix, "redeem_user_email"));
  const [createdFrom, setCreatedFrom] = useState(() => readScopedStringParam(searchParams, queryPrefix, "created_from"));
  const [createdTo, setCreatedTo] = useState(() => readScopedStringParam(searchParams, queryPrefix, "created_to"));
  const [redeemedFrom, setRedeemedFrom] = useState(() => readScopedStringParam(searchParams, queryPrefix, "redeemed_from"));
  const [redeemedTo, setRedeemedTo] = useState(() => readScopedStringParam(searchParams, queryPrefix, "redeemed_to"));

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportConfirmText, setExportConfirmText] = useState("");
  const [actionDialog, setActionDialog] = useState(null);
  const { error, clearError, captureError } = useErrorHandler();

  useEffect(() => {
    setSearchParams(
      mergeScopedSearchParams(searchParams, queryPrefix, {
        page,
        page_size: pageSize,
        batch_id: batchId,
        status: statusFilter,
        redeem_user_email: redeemUserEmail,
        created_from: createdFrom,
        created_to: createdTo,
        redeemed_from: redeemedFrom,
        redeemed_to: redeemedTo,
      }),
      { replace: true }
    );
  }, [batchId, createdFrom, createdTo, page, pageSize, queryPrefix, redeemUserEmail, redeemedFrom, redeemedTo, searchParams, setSearchParams, statusFilter]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function loadCodes(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        status: statusFilter,
        redeem_user_email: redeemUserEmail.trim(),
      });
      if (batchId.trim()) query.set("batch_id", batchId.trim());
      if (createdFrom) query.set("created_from", datetimeLocalToBeijingOffset(createdFrom));
      if (createdTo) query.set("created_to", datetimeLocalToBeijingOffset(createdTo));
      if (redeemedFrom) query.set("redeemed_from", datetimeLocalToBeijingOffset(redeemedFrom));
      if (redeemedTo) query.set("redeemed_to", datetimeLocalToBeijingOffset(redeemedTo));

      const resp = await apiCall(`/api/admin/redeem-codes?${query.toString()}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRedeemCodesTab",
            action: "加载兑换码列表",
            endpoint: "/api/admin/redeem-codes",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载兑换码失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
      setSelectedIds(new Set());
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRedeemCodesTab",
          action: "加载兑换码列表",
          endpoint: "/api/admin/redeem-codes",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCodes(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function toggleSelect(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function copyFilters() {
    try {
      await copyCurrentUrl();
      toast.success("已复制筛选链接");
    } catch (error) {
      toast.error(`复制失败: ${String(error)}`);
    }
  }

  async function applyCodeAction(codeId, actionPath, actionLabel) {
    setStatus("");
    clearError();
    try {
      const resp = await apiCall(`/api/admin/redeem-codes/${codeId}/${actionPath}`, { method: "POST" });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRedeemCodesTab",
            action: actionLabel,
            endpoint: `/api/admin/redeem-codes/${codeId}/${actionPath}`,
            method: "POST",
            meta: { code_id: codeId, action_path: actionPath },
            fallbackMessage: `${actionLabel}失败`,
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      toast.success(`${actionLabel}成功`);
      setActionDialog(null);
      await loadCodes(page);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRedeemCodesTab",
          action: actionLabel,
          endpoint: `/api/admin/redeem-codes/${codeId}/${actionPath}`,
          method: "POST",
          meta: { code_id: codeId, action_path: actionPath },
        }),
      );
      setStatus(formattedError.displayMessage);
    }
  }

  async function bulkDisable() {
    if (selectedIds.size === 0) {
      const message = "请先选择兑换码";
      setStatus(message);
      toast.error(message);
      return;
    }

    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/redeem-codes/bulk-disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_ids: Array.from(selectedIds) }),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRedeemCodesTab",
            action: "批量停用兑换码",
            endpoint: "/api/admin/redeem-codes/bulk-disable",
            method: "POST",
            meta: { code_ids: Array.from(selectedIds) },
            fallbackMessage: "批量停用失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setConfirmBulkOpen(false);
      toast.success(`已停用 ${Number(data.changed_count || 0)} 个兑换码`);
      await loadCodes(page);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRedeemCodesTab",
          action: "批量停用兑换码",
          endpoint: "/api/admin/redeem-codes/bulk-disable",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    }
  }

  async function exportUnredeemedCsv() {
    setExporting(true);
    setStatus("");
    clearError();
    try {
      const payload = {
        confirm_text: exportConfirmText.trim(),
      };
      if (batchId.trim()) payload.batch_id = Number(batchId.trim());

      const resp = await apiCall("/api/admin/redeem-codes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const data = await parseJsonSafely(resp);
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRedeemCodesTab",
            action: "导出未兑换码",
            endpoint: "/api/admin/redeem-codes/export",
            method: "POST",
            meta: payload,
            fallbackMessage: "导出失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }

      const blob = await resp.blob();
      const link = document.createElement("a");
      const href = URL.createObjectURL(blob);
      link.href = href;
      link.download = fileNameFromDisposition(resp.headers.get("content-disposition"), "redeem_codes.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setExportDialogOpen(false);
      setExportConfirmText("");
      toast.success("导出成功");
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRedeemCodesTab",
          action: "导出未兑换码",
          endpoint: "/api/admin/redeem-codes/export",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" />
            兑换码列表
          </CardTitle>
          <CardDescription>支持筛选、停用/启用、废弃、批量停用与 CSV 导出（时间按北京时间）。</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyFilters}>
            复制筛选链接
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadCodes(page)} disabled={loading}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {summaryCards.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {summaryCards.map((item) => (
              <MetricCard key={item.label} icon={Ticket} label={item.label} value={item.value} hint={item.hint} tone={item.tone || "default"} />
            ))}
          </div>
        ) : null}

        <form
          className="grid gap-2 md:grid-cols-4 xl:grid-cols-8"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadCodes(1);
          }}
        >
          <Input value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="批次ID" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="unredeemed">未兑</SelectItem>
              <SelectItem value="redeemed">已兑</SelectItem>
              <SelectItem value="expired">失效</SelectItem>
              <SelectItem value="disabled">停用</SelectItem>
              <SelectItem value="abandoned">废弃</SelectItem>
            </SelectContent>
          </Select>
          <Input value={redeemUserEmail} onChange={(event) => setRedeemUserEmail(event.target.value)} placeholder="兑换用户邮箱" />
          <Input type="datetime-local" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} placeholder="创建开始" />
          <Input type="datetime-local" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} placeholder="创建结束" />
          <Input type="datetime-local" value={redeemedFrom} onChange={(event) => setRedeemedFrom(event.target.value)} placeholder="兑换开始" />
          <Input type="datetime-local" value={redeemedTo} onChange={(event) => setRedeemedTo(event.target.value)} placeholder="兑换结束" />
          <Button type="submit" variant="outline">查询</Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConfirmBulkOpen(true)} disabled={selectedIds.size === 0}>
            <ShieldBan className="size-4" />
            批量停用
          </Button>
          <Button onClick={() => setExportDialogOpen(true)} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "导出中..." : "导出未兑换 CSV"}
          </Button>
        </div>

        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[1240px]">
            <TableHeader>
              <TableRow>
                <TableHead>选择</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>兑换码(脱敏)</TableHead>
                <TableHead>批次</TableHead>
                <TableHead>面额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>有效状态</TableHead>
                <TableHead>兑换用户</TableHead>
                <TableHead>兑换时间</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleSelect(item.id, event.target.checked)}
                        disabled={item.effective_status === "redeemed"}
                      />
                    </TableCell>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.code_mask}</TableCell>
                    <TableCell>{item.batch_name} (#{item.batch_id})</TableCell>
                    <TableCell>{formatMoneyCents(item.face_value_amount_cents ?? item.face_value_points ?? 0)}</TableCell>
                    <TableCell><Badge variant="outline">{item.status}</Badge></TableCell>
                    <TableCell><Badge>{item.effective_status}</Badge></TableCell>
                    <TableCell>{item.redeemed_user_email || "-"}</TableCell>
                    <TableCell>{formatDateTimeBeijing(item.redeemed_at)}</TableCell>
                    <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setActionDialog({ codeId: item.id, actionPath: "enable", actionLabel: "启用", codeMask: item.code_mask })}>启用</Button>
                        <Button size="sm" variant="outline" onClick={() => setActionDialog({ codeId: item.id, actionPath: "disable", actionLabel: "停用", codeMask: item.code_mask })}>停用</Button>
                        <Button size="sm" onClick={() => setActionDialog({ codeId: item.id, actionPath: "abandon", actionLabel: "废弃", codeMask: item.code_mask })}>废弃</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">暂无数据</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">总计 {total} 条</p>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => { setPage(1); setPageSize(Number(value)); }}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / 页</SelectItem>
                <SelectItem value="20">20 / 页</SelectItem>
                <SelectItem value="50">50 / 页</SelectItem>
              </SelectContent>
            </Select>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem><PaginationPrevious disabled={page <= 1} onClick={() => setPage(page - 1)} /></PaginationItem>
                <PaginationItem><PaginationLink isActive>{page} / {pageCount}</PaginationLink></PaginationItem>
                <PaginationItem><PaginationNext disabled={page >= pageCount} onClick={() => setPage(page + 1)} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>

        {error ? <AdminErrorNotice error={error} /> : status ? <Alert><AlertDescription>{status}</AlertDescription></Alert> : null}

        <Dialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认批量停用兑换码</DialogTitle>
              <DialogDescription>本次将停用 {selectedIds.size} 个兑换码，已兑换码不会被选中。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmBulkOpen(false)}>取消</Button>
              <Button onClick={bulkDisable}>确认停用</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认导出未兑换码 CSV</DialogTitle>
              <DialogDescription>请输入 `EXPORT` 以确认导出当前批次下的未兑换码。</DialogDescription>
            </DialogHeader>
            <Input value={exportConfirmText} onChange={(event) => setExportConfirmText(event.target.value)} placeholder="输入 EXPORT" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>取消</Button>
              <Button onClick={exportUnredeemedCsv} disabled={exporting || exportConfirmText.trim() !== "EXPORT"}>
                {exporting ? "导出中..." : "确认导出"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认兑换码操作</DialogTitle>
              <DialogDescription>
                将对兑换码 `{actionDialog?.codeMask || "-"}` 执行“{actionDialog?.actionLabel || "-"}”。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)}>取消</Button>
              <Button onClick={() => actionDialog && applyCodeAction(actionDialog.codeId, actionDialog.actionPath, actionDialog.actionLabel)}>
                确认执行
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
