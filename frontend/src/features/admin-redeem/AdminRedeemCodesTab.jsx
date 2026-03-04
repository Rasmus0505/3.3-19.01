import { Download, ShieldBan, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { datetimeLocalToBeijingOffset, formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

function parseError(data, fallback) {
  return data?.message || fallback;
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

function toCodeStatusLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key === "unredeemed") return "未兑";
  if (key === "redeemed") return "已兑";
  if (key === "disabled") return "已停用";
  if (key === "abandoned") return "已废弃";
  if (key === "expired") return "已失效";
  return "未知状态";
}

export function AdminRedeemCodesTab({ apiCall }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [batchId, setBatchId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [redeemUserEmail, setRedeemUserEmail] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [redeemedFrom, setRedeemedFrom] = useState("");
  const [redeemedTo, setRedeemedTo] = useState("");

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exporting, setExporting] = useState(false);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function loadCodes(nextPage = page) {
    setLoading(true);
    setStatus("");
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
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载兑换码失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSelectedIds(new Set());
    } catch (error) {
      const message = "网络连接异常，请重试。";
      setStatus(message);
      toast.error(message);
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

  async function applyCodeAction(codeId, actionPath, actionLabel) {
    if (actionPath === "disable" || actionPath === "abandon") {
      const ok = window.confirm("操作后不可自动恢复，请确认。");
      if (!ok) return;
    }
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/redeem-codes/${codeId}/${actionPath}`, { method: "POST" });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, `${actionLabel}失败`);
        setStatus(message);
        toast.error(message);
        return;
      }
      toast.success(`${actionLabel}成功`);
      await loadCodes(page);
    } catch (error) {
      const message = "网络连接异常，请重试。";
      setStatus(message);
      toast.error(message);
    }
  }

  async function bulkDisable() {
    if (selectedIds.size === 0) {
      const message = "请先选择兑换码";
      setStatus(message);
      toast.error(message);
      return;
    }
    if (!window.confirm(`确认批量停用 ${selectedIds.size} 个兑换码？操作后不可自动恢复，请确认。`)) return;

    setStatus("");
    try {
      const resp = await apiCall("/api/admin/redeem-codes/bulk-disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_ids: Array.from(selectedIds) }),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "批量停用失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      toast.success(`已停用 ${Number(data.changed_count || 0)} 个兑换码`);
      await loadCodes(page);
    } catch (error) {
      const message = "网络连接异常，请重试。";
      setStatus(message);
      toast.error(message);
    }
  }

  async function exportUnredeemedCsv() {
    const confirmText = window.prompt("此操作会导出敏感记录，请输入 EXPORT 确认。");
    if (!confirmText) return;

    setExporting(true);
    setStatus("");
    try {
      const payload = {
        confirm_text: confirmText,
      };
      if (batchId.trim()) payload.batch_id = Number(batchId.trim());

      const resp = await apiCall("/api/admin/redeem-codes/export", {
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
      link.download = fileNameFromDisposition(resp.headers.get("content-disposition"), "redeem_codes.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast.success("导出成功");
    } catch (error) {
      const message = "网络连接异常，请重试。";
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
          <Ticket className="size-4" />
          兑换码列表
        </CardTitle>
        <CardDescription>支持筛选、停用/启用、废弃、批量停用与 CSV 导出（时间按北京时间）。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 md:grid-cols-8"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            loadCodes(1);
          }}
        >
          <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="批次ID" />
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
          <Input value={redeemUserEmail} onChange={(e) => setRedeemUserEmail(e.target.value)} placeholder="兑换用户邮箱" />
          <Input type="datetime-local" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} placeholder="创建开始" />
          <Input type="datetime-local" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} placeholder="创建结束" />
          <Input type="datetime-local" value={redeemedFrom} onChange={(e) => setRedeemedFrom(e.target.value)} placeholder="兑换开始" />
          <Input type="datetime-local" value={redeemedTo} onChange={(e) => setRedeemedTo(e.target.value)} placeholder="兑换结束" />
          <Button type="submit" variant="outline">查询</Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => loadCodes(page)} disabled={loading}>刷新</Button>
          <Button variant="outline" onClick={bulkDisable} disabled={selectedIds.size === 0}>
            <ShieldBan className="size-4" />
            批量停用
          </Button>
          <Button onClick={exportUnredeemedCsv} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "导出中..." : "导出记录（CSV）"}
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
                        onChange={(e) => toggleSelect(item.id, e.target.checked)}
                        disabled={item.effective_status === "redeemed"}
                      />
                    </TableCell>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.code_mask}</TableCell>
                    <TableCell>{item.batch_name} (#{item.batch_id})</TableCell>
                    <TableCell>{item.face_value_points}</TableCell>
                    <TableCell><Badge variant="outline">{toCodeStatusLabel(item.status)}</Badge></TableCell>
                    <TableCell><Badge>{toCodeStatusLabel(item.effective_status)}</Badge></TableCell>
                    <TableCell>{item.redeemed_user_email || "-"}</TableCell>
                    <TableCell>{formatDateTimeBeijing(item.redeemed_at)}</TableCell>
                    <TableCell>{formatDateTimeBeijing(item.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => applyCodeAction(item.id, "enable", "启用")}>
                          启用
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => applyCodeAction(item.id, "disable", "停用")}>
                          停用
                        </Button>
                        <Button size="sm" onClick={() => applyCodeAction(item.id, "abandon", "废弃")}>废弃</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">暂无数据，请调整筛选条件后重试。</TableCell>
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
