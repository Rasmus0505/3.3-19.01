import { Gift, PauseCircle, PlayCircle, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, MetricCard, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "../../shared/ui";

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

export function AdminRedeemBatchesTab({ apiCall }) {
  const beijingNow = getBeijingNowForPicker();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [summaryCards, setSummaryCards] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [keyword, setKeyword] = useState(() => readStringParam(searchParams, "keyword"));
  const [statusFilter, setStatusFilter] = useState(() => readStringParam(searchParams, "status", "all") || "all");

  const [creating, setCreating] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [faceValuePoints, setFaceValuePoints] = useState(100);
  const [generateQuantity, setGenerateQuantity] = useState(100);
  const [activeFrom, setActiveFrom] = useState(toLocalDatetimeValue(beijingNow));
  const [expireAt, setExpireAt] = useState(toLocalDatetimeValue(new Date(beijingNow.getTime() + 30 * 24 * 60 * 60 * 1000)));
  const [dailyLimit, setDailyLimit] = useState("");
  const [remark, setRemark] = useState("");
  const [lastGeneratedCodes, setLastGeneratedCodes] = useState([]);
  const [actionDialog, setActionDialog] = useState(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyBatchId, setCopyBatchId] = useState(null);
  const [copyQuantity, setCopyQuantity] = useState("100");

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        keyword,
        status: statusFilter,
      }),
      { replace: true }
    );
  }, [keyword, page, pageSize, setSearchParams, statusFilter]);

  async function loadBatches(nextPage = page) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        keyword: keyword.trim(),
        status: statusFilter,
      });
      const resp = await apiCall(`/api/admin/redeem-batches?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载批次失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBatches(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const batchHealth = useMemo(() => {
    const totalIssued = items.reduce((sum, item) => sum + Number(item.total_issued_points || 0), 0);
    const totalRedeemed = items.reduce((sum, item) => sum + Number(item.total_redeemed_points || 0), 0);
    const activeCount = items.filter((item) => item.status === "active").length;
    return { totalIssued, totalRedeemed, activeCount };
  }, [items]);

  async function createBatch(event) {
    event.preventDefault();
    setCreating(true);
    setStatus("");
    try {
      const payload = {
        batch_name: batchName.trim() || `batch-${Date.now()}`,
        face_value_points: Number(faceValuePoints),
        generate_quantity: Number(generateQuantity),
        active_from: datetimeLocalToBeijingOffset(activeFrom) || null,
        expire_at: datetimeLocalToBeijingOffset(expireAt) || null,
        remark: remark.trim(),
      };
      if (dailyLimit.trim()) {
        payload.daily_limit_per_user = Number(dailyLimit);
      }

      const resp = await apiCall("/api/admin/redeem-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "创建批次失败");
        setStatus(message);
        toast.error(message);
        return;
      }

      setLastGeneratedCodes(Array.isArray(data.generated_codes) ? data.generated_codes : []);
      const message = `批次创建成功：${data.batch?.batch_name || "-"}`;
      setStatus(message);
      toast.success(message);
      setPage(1);
      await loadBatches(1);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function copyFilters() {
    try {
      await copyCurrentUrl();
      toast.success("已复制筛选链接");
    } catch (error) {
      toast.error(`复制失败: ${String(error)}`);
    }
  }

  async function submitBatchAction() {
    if (!actionDialog) return;
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/redeem-batches/${actionDialog.batchId}/${actionDialog.actionPath}`, { method: "POST" });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, `${actionDialog.actionLabel}失败`);
        setStatus(message);
        toast.error(message);
        return;
      }
      setActionDialog(null);
      toast.success(`${actionDialog.actionLabel}成功`);
      await loadBatches(page);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    }
  }

  async function submitCopyBatch() {
    const quantity = Number(copyQuantity);
    if (!copyBatchId) return;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 5000) {
      const message = "数量不合法";
      setStatus(message);
      toast.error(message);
      return;
    }

    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/redeem-batches/${copyBatchId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate_quantity: quantity }),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "复制失败");
        setStatus(message);
        toast.error(message);
        return;
      }

      setLastGeneratedCodes(Array.isArray(data.generated_codes) ? data.generated_codes : []);
      setCopyDialogOpen(false);
      setCopyBatchId(null);
      toast.success("复制批次成功");
      setPage(1);
      await loadBatches(1);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="size-4" />
            创建兑换码批次
          </CardTitle>
          <CardDescription>一次性单码、固定面额、批量生成（时间按北京时间）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={createBatch}>
            <div className="space-y-2">
              <Label>批次名</Label>
              <Input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="如：3月活动A" />
            </div>
            <div className="space-y-2">
              <Label>面额</Label>
              <Input type="number" min={1} value={faceValuePoints} onChange={(event) => setFaceValuePoints(Number(event.target.value || 1))} />
            </div>
            <div className="space-y-2">
              <Label>生成数量</Label>
              <Input type="number" min={1} max={5000} value={generateQuantity} onChange={(event) => setGenerateQuantity(Number(event.target.value || 1))} />
            </div>
            <div className="space-y-2">
              <Label>生效时间</Label>
              <Input type="datetime-local" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>失效时间</Label>
              <Input type="datetime-local" value={expireAt} onChange={(event) => setExpireAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>单用户日限</Label>
              <Input type="number" min={1} value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} placeholder="例如 5" />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label>备注</Label>
              <Textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="可选" />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Button type="submit" disabled={creating}>{creating ? "创建中..." : "创建并生成兑换码"}</Button>
            </div>
          </form>

          {lastGeneratedCodes.length > 0 ? (
            <div className="rounded-md border p-4">
              <p className="mb-2 text-sm font-medium">最新生成兑换码（共 {lastGeneratedCodes.length} 条）</p>
              <div className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{lastGeneratedCodes.join("\n")}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="space-y-1 p-4"><p className="text-xs text-muted-foreground">当前页总发放点数</p><p className="text-xl font-semibold">{batchHealth.totalIssued}</p></CardContent></Card>
        <Card><CardContent className="space-y-1 p-4"><p className="text-xs text-muted-foreground">当前页已发放点数</p><p className="text-xl font-semibold">{batchHealth.totalRedeemed}</p></CardContent></Card>
        <Card><CardContent className="space-y-1 p-4"><p className="text-xs text-muted-foreground">当前页 active 批次数</p><p className="text-xl font-semibold">{batchHealth.activeCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">批次看板</CardTitle>
            <CardDescription>支持状态筛选、批次操作、参数复制和筛选链接分享。</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyFilters}>复制筛选链接</Button>
            <Button variant="outline" size="sm" onClick={() => loadBatches(page)} disabled={loading}>
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

          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); loadBatches(1); }}>
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按批次名搜索" className="max-w-xs" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="paused">paused</SelectItem>
                <SelectItem value="expired">expired</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline">查询</Button>
          </form>

          <ScrollArea className="w-full rounded-md border">
            <Table className="min-w-[1500px]">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>批次名</TableHead>
                  <TableHead>面额</TableHead>
                  <TableHead>总码数</TableHead>
                  <TableHead>已兑</TableHead>
                  <TableHead>剩余</TableHead>
                  <TableHead>兑换率</TableHead>
                  <TableHead>总发放点数</TableHead>
                  <TableHead>已发放点数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>生效时间</TableHead>
                  <TableHead>失效时间</TableHead>
                  <TableHead>日限</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.batch_name}</TableCell>
                    <TableCell>{item.face_value_points}</TableCell>
                    <TableCell>{item.generated_count}</TableCell>
                    <TableCell>{item.redeemed_count}</TableCell>
                    <TableCell>{item.remaining_count}</TableCell>
                    <TableCell>{(Number(item.redeem_rate || 0) * 100).toFixed(2)}%</TableCell>
                    <TableCell>{item.total_issued_points}</TableCell>
                    <TableCell>{item.total_redeemed_points}</TableCell>
                    <TableCell><Badge variant="outline">{item.status}</Badge></TableCell>
                    <TableCell>{formatDateTimeBeijing(item.active_from)}</TableCell>
                    <TableCell>{formatDateTimeBeijing(item.expire_at)}</TableCell>
                    <TableCell>{item.effective_daily_limit}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/admin/redeem?tab=codes&batch_id=${item.id}`}>兑换码</Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/admin/redeem?tab=audit&batch_id=${item.id}`}>审计</Link>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setActionDialog({ batchId: item.id, actionPath: "activate", actionLabel: "激活", batchName: item.batch_name })}>
                          <PlayCircle className="size-4" />
                          激活
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setActionDialog({ batchId: item.id, actionPath: "pause", actionLabel: "停用", batchName: item.batch_name })}>
                          <PauseCircle className="size-4" />
                          停用
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setActionDialog({ batchId: item.id, actionPath: "expire", actionLabel: "提前失效", batchName: item.batch_name })}>
                          提前失效
                        </Button>
                        <Button size="sm" onClick={() => { setCopyBatchId(item.id); setCopyQuantity("100"); setCopyDialogOpen(true); }}>复制参数</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-muted-foreground">暂无数据</TableCell>
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

      <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认批次操作</DialogTitle>
            <DialogDescription>
              将对批次 `{actionDialog?.batchName || "-"}` 执行“{actionDialog?.actionLabel || "-"}”。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>取消</Button>
            <Button onClick={submitBatchAction}>确认执行</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>复制批次参数</DialogTitle>
            <DialogDescription>请输入复制后生成数量（1-5000）。</DialogDescription>
          </DialogHeader>
          <Input type="number" min={1} max={5000} value={copyQuantity} onChange={(event) => setCopyQuantity(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>取消</Button>
            <Button onClick={submitCopyBatch}>确认复制</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
