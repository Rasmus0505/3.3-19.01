import { Copy, Files, Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, parseResponse, toErrorText } from "../../../shared/api/client";
import { Badge, Button, Skeleton, Textarea } from "../../../shared/ui";
import { formatCreatedAt } from "../lessonListHelpers";


async function copyToClipboard(text, successMessage) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    toast.error("当前没有可复制的文本");
    return;
  }
  try {
    await navigator.clipboard.writeText(normalizedText);
    toast.success(successMessage);
  } catch (_) {
    toast.error("复制失败，请检查浏览器剪贴板权限");
  }
}


export function AsrRecordHistorySection({ accessToken, onOpenUpload }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedRecordId, setExpandedRecordId] = useState(0);
  const [detailMap, setDetailMap] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(0);
  const [deletingId, setDeletingId] = useState(0);
  const [viewModeMap, setViewModeMap] = useState({});

  const expandedRecord = useMemo(() => detailMap[expandedRecordId] || null, [detailMap, expandedRecordId]);

  async function loadRecords() {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const resp = await api("/api/asr-records", {}, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(data, "加载 ASR 记录失败"));
      }
      setRecords(Array.isArray(data.items) ? data.items : []);
    } catch (loadError) {
      setError(loadError instanceof Error && loadError.message ? loadError.message : "加载 ASR 记录失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadRecordDetail(recordId) {
    if (!accessToken || !recordId || detailMap[recordId]) return;
    setDetailLoadingId(recordId);
    try {
      const resp = await api(`/api/asr-records/${recordId}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(data, "加载 ASR 记录详情失败"));
      }
      setDetailMap((current) => ({ ...current, [recordId]: data }));
      setViewModeMap((current) => ({ ...current, [recordId]: String(data.output_mode || "per_file") }));
    } catch (loadError) {
      toast.error(loadError instanceof Error && loadError.message ? loadError.message : "加载 ASR 记录详情失败");
    } finally {
      setDetailLoadingId(0);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, [accessToken]);

  async function toggleExpand(recordId) {
    const nextExpanded = expandedRecordId === recordId ? 0 : recordId;
    setExpandedRecordId(nextExpanded);
    if (nextExpanded > 0) {
      await loadRecordDetail(nextExpanded);
    }
  }

  async function handleDelete(recordId) {
    if (!accessToken || !recordId) return;
    if (!window.confirm("确认删除这条 ASR 识别记录？删除后不可恢复。")) {
      return;
    }
    setDeletingId(recordId);
    try {
      const resp = await api(`/api/asr-records/${recordId}`, { method: "DELETE" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(data, "删除 ASR 记录失败"));
      }
      setRecords((current) => current.filter((item) => Number(item.id) !== Number(recordId)));
      setDetailMap((current) => {
        const next = { ...current };
        delete next[recordId];
        return next;
      });
      if (expandedRecordId === recordId) {
        setExpandedRecordId(0);
      }
      toast.success("已删除 ASR 记录");
    } catch (deleteError) {
      toast.error(deleteError instanceof Error && deleteError.message ? deleteError.message : "删除 ASR 记录失败");
    } finally {
      setDeletingId(0);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">ASR 记录</p>
          <p className="text-xs text-muted-foreground">查看最近的媒体识别结果，支持复制汇总文本、按文件查看和删除记录。</p>
        </div>
        {onOpenUpload ? (
          <Button type="button" variant="outline" className="h-9 px-4" onClick={onOpenUpload}>
            去上传更多媒体
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : null}

      {!loading && error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      {!loading && !error && records.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-background/80 px-6 py-8 text-center">
          <p className="text-sm font-medium">还没有 ASR 识别记录</p>
          <p className="mt-2 text-xs text-muted-foreground">去上传页切换到“仅 ASR 结果”，上传音频或视频后这里会自动出现历史记录。</p>
        </div>
      ) : null}

      {!loading && records.length > 0 ? (
        <div className="space-y-3">
          {records.map((record) => {
            const summary = record.summary || {};
            const expanded = Number(expandedRecordId || 0) === Number(record.id || 0);
            const detail = detailMap[record.id] || null;
            const currentViewMode = viewModeMap[record.id] || record.output_mode || "per_file";
            return (
              <div key={record.id} className="space-y-3 rounded-2xl border bg-background/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Files className="size-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{formatCreatedAt(record.created_at)}</p>
                      <Badge variant="outline">{record.asr_model}</Badge>
                      <Badge variant="outline">{record.record_status === "failed" ? "失败" : record.record_status === "partial" ? "部分成功" : "成功"}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{summary.file_count || 0} 个文件</span>
                      <span>成功 {summary.success_count || 0}</span>
                      <span>失败 {summary.failure_count || 0}</span>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">{record.preview_text || "无预览文本"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="h-8 px-3" onClick={() => void copyToClipboard(record.merged_text, "已复制汇总结果")}>
                      <Copy className="size-4" />
                      复制汇总
                    </Button>
                    <Button type="button" variant="outline" className="h-8 px-3" onClick={() => void toggleExpand(record.id)}>
                      {expanded ? "收起详情" : "查看详情"}
                    </Button>
                    <Button type="button" variant="ghost" className="h-8 px-3 text-destructive hover:text-destructive" disabled={deletingId === record.id} onClick={() => void handleDelete(record.id)}>
                      {deletingId === record.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      删除
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  detailLoadingId === record.id && !detail ? (
                    <div className="rounded-2xl border bg-muted/10 p-4 text-sm text-muted-foreground">正在加载详情...</div>
                  ) : detail ? (
                    <div className="space-y-4 rounded-2xl border bg-muted/10 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{detail.include_timestamps ? "带时间戳" : "纯文本"}</Badge>
                        {detail.include_filename_headers ? <Badge variant="outline">带文件名分隔</Badge> : null}
                      </div>

                      <div className="inline-flex rounded-2xl border bg-background/90 p-1">
                        <button
                          type="button"
                          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${currentViewMode === "per_file" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                          onClick={() => setViewModeMap((current) => ({ ...current, [record.id]: "per_file" }))}
                        >
                          逐文件结果
                        </button>
                        <button
                          type="button"
                          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${currentViewMode === "merged" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                          onClick={() => setViewModeMap((current) => ({ ...current, [record.id]: "merged" }))}
                        >
                          合并全文
                        </button>
                      </div>

                      {currentViewMode === "merged" ? (
                        <div className="space-y-2">
                          <div className="flex justify-end">
                            <Button type="button" variant="outline" className="h-8 px-3" onClick={() => void copyToClipboard(detail.merged_text, "已复制合并全文")}>
                              <Copy className="size-4" />
                              复制合并全文
                            </Button>
                          </div>
                          <Textarea value={String(detail.merged_text || "")} readOnly className="min-h-[240px] rounded-2xl font-mono text-xs leading-6" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(Array.isArray(detail.items) ? detail.items : []).map((item) => (
                            <div key={item.id} className="space-y-2 rounded-2xl border bg-background/90 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium">{item.source_filename}</p>
                                  <Badge variant="outline">{item.status === "failed" ? "失败" : "成功"}</Badge>
                                </div>
                                <Button type="button" variant="outline" className="h-8 px-3" onClick={() => void copyToClipboard(item.rendered_text, `已复制 ${item.source_filename}`)}>
                                  <Copy className="size-4" />
                                  复制本文件
                                </Button>
                              </div>
                              {item.error_message ? <p className="text-xs text-destructive">{item.error_message}</p> : null}
                              <Textarea value={String(item.rendered_text || "")} readOnly className="min-h-[160px] rounded-2xl font-mono text-xs leading-6" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
