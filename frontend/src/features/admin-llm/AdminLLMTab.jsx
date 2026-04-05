import { Brain, Languages, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { copyCurrentUrl, mergeSearchParams, readIntParam, readStringParam } from "../../shared/lib/adminSearchParams";
import { datetimeLocalToBeijingOffset, formatDateTimeBeijing, getBeijingNowForPicker } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  FilterPanel,
  Input,
  MetricCard,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui";

function toLocalDatetimeValue(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCentsToYuan(cents) {
  const val = Number(cents) || 0;
  return (val / 100).toFixed(4);
}

function MetricSummaryCard({ label, value, unit, hint, icon: Icon }) {
  return (
    <MetricCard
      label={label}
      value={value}
      hint={hint}
      icon={<Icon className="size-4" />}
    />
  );
}

export function AdminLLMTab({ apiCall }) {
  const now = getBeijingNowForPicker();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(() => readIntParam(searchParams, "page", 1, { min: 1 }));
  const [pageSize, setPageSize] = useState(() => readIntParam(searchParams, "page_size", 20, { min: 1, max: 100 }));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(() => readStringParam(searchParams, "user_id"));
  const [modelName, setModelName] = useState(() => readStringParam(searchParams, "model_name"));
  const [category, setCategory] = useState(() => readStringParam(searchParams, "category"));
  const [dateFrom, setDateFrom] = useState(() => readStringParam(searchParams, "date_from", toLocalDatetimeValue(defaultFrom)));
  const [dateTo, setDateTo] = useState(() => readStringParam(searchParams, "date_to", toLocalDatetimeValue(now)));
  const [summaryCards, setSummaryCards] = useState([]);
  const { error, clearError, captureError } = useErrorHandler();

  useEffect(() => {
    setSearchParams(
      mergeSearchParams(searchParams, {
        page,
        page_size: pageSize,
        user_id: userId,
        model_name: modelName,
        category,
        date_from: dateFrom,
        date_to: dateTo,
      }),
      { replace: true },
    );
  }, [category, dateFrom, dateTo, modelName, page, pageSize, searchParams, setSearchParams, userId]);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
      });
      if (userId) query.set("user_id", userId);
      if (modelName) query.set("model_name", modelName);
      if (category) query.set("category", category);
      if (dateFrom) {
        const from = datetimeLocalToBeijingOffset(dateFrom);
        if (from) query.set("date_from", from.toISOString());
      }
      if (dateTo) {
        const to = datetimeLocalToBeijingOffset(dateTo);
        if (to) query.set("date_to", to.toISOString());
      }

      const resp = await apiCall(`/api/admin/llm-usage?${query.toString()}`);
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminLLMTab",
            action: "加载大模型消费记录",
            endpoint: "/api/admin/llm-usage",
            method: "GET",
            fallbackMessage: "加载大模型消费记录失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }

      setItems(Array.isArray(data.records) ? data.records : []);
      setTotal(Number(data.total) || 0);
      setPage(nextPage);

      if (data.summary) {
        const cards = [];
        const byCategory = data.summary.by_category || [];
        for (const cat of byCategory) {
          if (cat.category === "llm") {
            cards.push({
              label: "LLM 请求数",
              value: Number(cat.count || 0),
              hint: `成本 ${formatCentsToYuan(cat.input_cost_cents)} 元 · 售价 ${formatCentsToYuan(cat.charge_cents)} 元 · 利润 ${formatCentsToYuan(cat.gross_profit_cents)} 元`,
              icon: Brain,
            });
          } else if (cat.category === "mt") {
            cards.push({
              label: "MT 翻译请求数",
              value: Number(cat.count || 0),
              hint: `成本 ${formatCentsToYuan(cat.input_cost_cents)} 元 · 售价 ${formatCentsToYuan(cat.charge_cents)} 元 · 利润 ${formatCentsToYuan(cat.gross_profit_cents)} 元`,
              icon: Languages,
            });
          } else if (cat.category === "asr") {
            cards.push({
              label: "ASR 请求数",
              value: Number(cat.count || 0),
              hint: `成本 ${formatCentsToYuan(cat.input_cost_cents)} 元 · 售价 ${formatCentsToYuan(cat.charge_cents)} 元 · 利润 ${formatCentsToYuan(cat.gross_profit_cents)} 元`,
              icon: RefreshCcw,
            });
          }
        }
        setSummaryCards(cards);
      }
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminLLMTab",
          action: "加载大模型消费记录",
          endpoint: "/api/admin/llm-usage",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(1);
  }, []);

  function buildFilterControls() {
    return (
      <FilterPanel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">用户ID</label>
            <Input
              placeholder="用户ID"
              value={userId || ""}
              onChange={(e) => setUserId(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">类别</label>
            <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="llm">LLM</SelectItem>
                <SelectItem value="mt">MT翻译</SelectItem>
                <SelectItem value="asr">ASR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">模型</label>
            <Select value={modelName || "all"} onValueChange={(v) => setModelName(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="全部模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模型</SelectItem>
                <SelectItem value="deepseek-v3">DeepSeek V3 (思考)</SelectItem>
                <SelectItem value="deepseek-v3">DeepSeek V3 (快速)</SelectItem>
                <SelectItem value="qwen-mt-flash">Qwen MT Flash</SelectItem>
                <SelectItem value="qwen3-asr-flash-filetrans">Qwen ASR</SelectItem>
                <SelectItem value="faster-whisper-medium">Faster Whisper</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">开始时间</label>
            <Input
              type="datetime-local"
              value={dateFrom || ""}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">结束时间</label>
            <Input
              type="datetime-local"
              value={dateTo || ""}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">每页</label>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void loadLogs(1)} disabled={loading}>
              <RefreshCcw className="size-3" />
              搜索
            </Button>
            <Button size="sm" variant="ghost" onClick={() => copyCurrentUrl()}>
              复制链接
            </Button>
          </div>
        </div>
      </FilterPanel>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {summaryCards.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <MetricSummaryCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {buildFilterControls()}

      {loading && (
        <div className="text-sm text-muted-foreground">加载中...</div>
      )}

      {!loading && items.length === 0 && (
        <Alert>
          <AlertDescription>暂无消费记录</AlertDescription>
        </Alert>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">用户</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">类别</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">模型</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Prompt Tokens</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Completion Tokens</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">推理 Tokens</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">总计 Tokens</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">成本（元）</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">售价（元）</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">利润（元）</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2">{item.user_id || "-"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          item.category === "llm"
                            ? "border-blue-500 text-blue-600"
                            : item.category === "mt"
                              ? "border-green-500 text-green-600"
                              : "border-orange-500 text-orange-600"
                        }
                      >
                        {item.category === "llm" ? "LLM" : item.category === "mt" ? "MT翻译" : "ASR"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.model_name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{item.prompt_tokens}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{item.completion_tokens}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {item.reasoning_tokens > 0 ? (
                        <span className="text-blue-600">{item.reasoning_tokens}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">{item.total_tokens}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatCentsToYuan(item.input_cost_cents)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatCentsToYuan(item.charge_cents)}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-xs font-medium ${
                        (item.gross_profit_cents || 0) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCentsToYuan(item.gross_profit_cents)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTimeBeijing(item.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              共 {total} 条，第 {page} / {totalPages || 1} 页
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => page > 1 && void loadLogs(page - 1)}
                    className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        isActive={pageNum === page}
                        onClick={() => void loadLogs(pageNum)}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => page < totalPages && void loadLogs(page + 1)}
                    className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
