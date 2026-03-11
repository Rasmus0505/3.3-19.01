import { Download, RefreshCcw, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, MetricCard, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

function toLocalDatetimeValue(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fileNameFromDisposition(disposition, fallback) {
  const match = String(disposition || "").match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
  const raw = match?.[1] || match?.[2];
  return raw ? decodeURIComponent(raw) : fallback;
}

export function AdminRedeemAuditTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [summaryCards, setSummaryCards] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [userEmail, setUserEmail] = useState(() => readStringParam(searchParams, "user_email"));
  const [batchId, setBatchId] = useState(() => readStringParam(searchParams, "batch_id"));
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportConfirmText, setExportConfirmText] = useState("");
  const { error, clearError, captureError } = useErrorHandler();

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        user_email: userEmail,
        batch_id: batchId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true }
    );
  }, [batchId, dateFrom, dateTo, page, pageSize, setSearchParams, userEmail]);

  async function loadAudit(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
        batch_id: batchId.trim(),
      });
      const normalizedDateFrom = datetimeLocalToBeijingOffset(dateFrom);
      const normalizedDateTo = datetimeLocalToBeijingOffset(dateTo);
      if (normalizedDateFrom) query.set("date_from", normalizedDateFrom);
      if (normalizedDateTo) query.set("date_to", normalizedDateTo);
      const resp = await apiCall(`/api/admin/redeem-audit?${query.toString()}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRedeemAuditTab",
            action: "加载兑换审计",
            endpoint: "/api/admin/redeem-audit",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载审计日志失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRedeemAuditTab",
          action: "加载兑换审计",
          endpoint: "/api/admin/redeem-audit",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAudit(page);
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

  async function exportCsv() {
    setExporting(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/redeem-audit/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm_text: exportConfirmText.trim(),
          batch_id: batchId.trim() ? Number(batchId.trim()) : null,
          user_email: userEmail.trim(),
          date_from: datetimeLocalToBeijingOffset(dateFrom) || null,
          date_to: datetimeLocalToBeijingOffset(dateTo) || null,
        }),
      });
      if (!resp.ok) {
        const data = await parseJsonSafely(resp);
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRedeemAuditTab",
            action: "导出兑换审计",
            endpoint: "/api/admin/redeem-audit/export",
            method: "POST",
            meta: { user_email: userEmail.trim(), batch_id: batchId.trim() },
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
      link.download = fileNameFromDisposition(resp.headers.get("content-disposition"), "redeem_audit.csv");
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
          component: "AdminRedeemAuditTab",
          action: "导出兑换审计",
          endpoint: "/api/admin/redeem-audit/export",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setExporting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="size-4" />
            兑换记录 / 审计
          </CardTitle>
          <CardDescription>记录成功和失败兑换，支持筛选、链接分享和安全导出（时间按北京时间）。</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyFilters}>
            复制筛选链接
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadAudit(page)} disabled={loading}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {summaryCards.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {summaryCards.map((item) => (
              <MetricCard key={item.label} icon={ScrollText} label={item.label} value={item.value} hint={item.hint} tone={item.tone || "default"} />
            ))}
          </div>
        ) : null}

        <form
          className="grid gap-2 md:grid-cols-3 xl:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadAudit(1);
          }}
        >
          <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="用户邮箱" />
          <Input value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="批次ID" />
          <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button type="submit" variant="outline">查询</Button>
          <Button type="button" onClick={() => setExportDialogOpen(true)} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "导出中..." : "导出 CSV"}
          </Button>
        </form>

        {loading ? <Skeleton className="h-10 w-full" /> : null}

        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>批次</TableHead>
                <TableHead>兑换码</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                  <TableCell>{item.user_email || "-"}</TableCell>
                  <TableCell>{item.batch_name ? `${item.batch_name} (#${item.batch_id})` : "-"}</TableCell>
                  <TableCell>{item.code_mask || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={item.success ? "default" : "destructive"}>{item.success ? "成功" : "失败"}</Badge>
                  </TableCell>
                  <TableCell>{item.failure_reason || "-"}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
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
                  <PaginationLink isActive>{page} / {pageCount}</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext disabled={page >= pageCount} onClick={() => setPage(page + 1)} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>

        {error ? <AdminErrorNotice error={error} /> : status ? <Alert><AlertDescription>{status}</AlertDescription></Alert> : null}

        <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认导出审计 CSV</DialogTitle>
              <DialogDescription>请输入 `EXPORT` 以确认导出当前筛选结果。</DialogDescription>
            </DialogHeader>
            <Input value={exportConfirmText} onChange={(event) => setExportConfirmText(event.target.value)} placeholder="输入 EXPORT" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>取消</Button>
              <Button onClick={exportCsv} disabled={exporting || exportConfirmText.trim() !== "EXPORT"}>
                {exporting ? "导出中..." : "确认导出"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
