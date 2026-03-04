import { Download, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { datetimeLocalToBeijingOffset, formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

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

function fileNameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;
  const match = disposition.match(/filename=([^;]+)/i);
  if (!match?.[1]) return fallback;
  return match[1].trim().replace(/^"|"$/g, "");
}

export function AdminRedeemAuditTab({ apiCall }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [userEmail, setUserEmail] = useState("");
  const [batchId, setBatchId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [exporting, setExporting] = useState(false);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function loadAudit(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
      });
      if (batchId.trim()) query.set("batch_id", batchId.trim());
      if (dateFrom) query.set("date_from", datetimeLocalToBeijingOffset(dateFrom));
      if (dateTo) query.set("date_to", datetimeLocalToBeijingOffset(dateTo));

      const resp = await apiCall(`/api/admin/redeem-audit?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载审计失败");
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
    loadAudit(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  async function exportCsv() {
    const confirmText = window.prompt("请输入 EXPORT 确认导出审计 CSV");
    if (!confirmText) return;

    setExporting(true);
    setStatus("");
    try {
      const payload = {
        confirm_text: confirmText,
        user_email: userEmail.trim(),
      };
      if (batchId.trim()) payload.batch_id = Number(batchId.trim());
      if (dateFrom) payload.date_from = datetimeLocalToBeijingOffset(dateFrom);
      if (dateTo) payload.date_to = datetimeLocalToBeijingOffset(dateTo);

      const resp = await apiCall("/api/admin/redeem-audit/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const data = await jsonOrEmpty(resp);
        const message = parseError(data, "导出失败");
        setStatus(message);
        toast.error(message);
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
      toast.success("导出成功");
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4" />
          兑换记录 / 审计
        </CardTitle>
        <CardDescription>记录成功和失败兑换，支持筛选导出（时间按北京时间）。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 md:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadAudit(1);
          }}
        >
          <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="用户邮箱" />
          <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="批次ID" />
          <Input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button type="submit" variant="outline">查询</Button>
          <Button type="button" onClick={exportCsv} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "导出中..." : "导出 CSV"}
          </Button>
        </form>

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
                  <TableCell colSpan={7} className="text-muted-foreground">暂无数据</TableCell>
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

        {status ? <Alert><AlertDescription>{status}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
