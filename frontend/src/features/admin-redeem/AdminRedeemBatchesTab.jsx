import { Gift, PauseCircle, PlayCircle, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "../../shared/ui";

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
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminRedeemBatchesTab({ apiCall }) {
  const beijingNow = getBeijingNowForPicker();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [creating, setCreating] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [faceValuePoints, setFaceValuePoints] = useState(100);
  const [generateQuantity, setGenerateQuantity] = useState(100);
  const [activeFrom, setActiveFrom] = useState(toLocalDatetimeValue(beijingNow));
  const [expireAt, setExpireAt] = useState(toLocalDatetimeValue(new Date(beijingNow.getTime() + 30 * 24 * 60 * 60 * 1000)));
  const [dailyLimit, setDailyLimit] = useState("");
  const [remark, setRemark] = useState("");
  const [lastGeneratedCodes, setLastGeneratedCodes] = useState([]);

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

  async function changeBatchStatus(batchId, actionPath, actionLabel) {
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/redeem-batches/${batchId}/${actionPath}`, { method: "POST" });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, `${actionLabel}失败`);
        setStatus(message);
        toast.error(message);
        return;
      }
      toast.success(`${actionLabel}成功`);
      await loadBatches(page);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    }
  }

  async function copyBatch(batchId) {
    const value = window.prompt("请输入复制后生成数量（1-5000）", "100");
    if (!value) return;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 5000) {
      const message = "数量不合法";
      setStatus(message);
      toast.error(message);
      return;
    }

    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/redeem-batches/${batchId}/copy`, {
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
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createBatch}>
            <div className="grid gap-1">
              <Label>批次名</Label>
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="如：3月活动A" />
            </div>
            <div className="grid gap-1">
              <Label>面额点数</Label>
              <Input type="number" min={1} value={faceValuePoints} onChange={(e) => setFaceValuePoints(Number(e.target.value || 1))} />
            </div>
            <div className="grid gap-1">
              <Label>生成数量</Label>
              <Input type="number" min={1} max={5000} value={generateQuantity} onChange={(e) => setGenerateQuantity(Number(e.target.value || 1))} />
            </div>
            <div className="grid gap-1">
              <Label>单账号日限（留空用全局）</Label>
              <Input type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="例如 5" />
            </div>
            <div className="grid gap-1">
              <Label>生效时间</Label>
              <Input type="datetime-local" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>失效时间</Label>
              <Input type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Label>备注</Label>
              <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="可选" />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit" disabled={creating}>{creating ? "创建中..." : "创建并生成兑换码"}</Button>
              <Button type="button" variant="outline" onClick={() => loadBatches(page)}>
                <RefreshCcw className="size-4" />
                刷新
              </Button>
            </div>
          </form>
          {lastGeneratedCodes.length > 0 ? (
            <div className="mt-4 rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">最新生成兑换码（共 {lastGeneratedCodes.length} 条）</p>
              <Textarea readOnly rows={6} value={lastGeneratedCodes.join("\n")} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">批次看板</CardTitle>
          <CardDescription>支持状态筛选、批次操作和参数复制。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              loadBatches(1);
            }}
          >
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按批次名搜索" className="max-w-xs" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
            <Table className="min-w-[1320px]">
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
                        <Button size="sm" variant="outline" onClick={() => changeBatchStatus(item.id, "activate", "激活")}>
                          <PlayCircle className="size-4" />
                          激活
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => changeBatchStatus(item.id, "pause", "停用")}>
                          <PauseCircle className="size-4" />
                          停用
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => changeBatchStatus(item.id, "expire", "失效")}>
                          提前失效
                        </Button>
                        <Button size="sm" onClick={() => copyBatch(item.id)}>复制参数</Button>
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
    </div>
  );
}
