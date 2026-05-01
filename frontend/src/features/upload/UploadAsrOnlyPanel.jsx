import { AudioLines, Copy, Files, History, Loader2, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { uploadWithProgress } from "../../shared/api/client";
import { getAsrModelCatalogItem } from "../../shared/lib/asrModels";
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "../../shared/ui";
import { LOCAL_ASR_FILE_ACCEPT, UPLOAD_MODEL_OPTIONS } from "./uploadConstants";


function buildResultSummaryText(record) {
  const summary = record?.summary || {};
  if (record?.record_status === "failed") {
    return `共 ${summary.file_count || 0} 个文件，全部识别失败，但记录已写入历史。`;
  }
  if (record?.record_status === "partial") {
    return `共 ${summary.file_count || 0} 个文件，成功 ${summary.success_count || 0} 个，失败 ${summary.failure_count || 0} 个。`;
  }
  return `共 ${summary.file_count || 0} 个文件，已全部识别完成。`;
}


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


export function UploadAsrOnlyPanel({
  accessToken,
  selectedModel,
  onSelectedModelChange,
  asrModelCatalogMap,
  onBusyChange,
  onOpenHistory,
}) {
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [outputMode, setOutputMode] = useState("per_file");
  const [includeTimestamps, setIncludeTimestamps] = useState(false);
  const [includeFilenameHeaders, setIncludeFilenameHeaders] = useState(true);
  const [activeViewMode, setActiveViewMode] = useState("per_file");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [resultRecord, setResultRecord] = useState(null);

  useEffect(() => {
    onBusyChange?.(loading);
  }, [loading, onBusyChange]);

  const modelOptions = useMemo(
    () =>
      UPLOAD_MODEL_OPTIONS.map((item) => {
        const catalogItem = getAsrModelCatalogItem(item.key, asrModelCatalogMap);
        return {
          key: item.key,
          label: String(catalogItem?.display_name || item.title || item.key),
          subtitle: String(catalogItem?.note || item.note || ""),
        };
      }),
    [asrModelCatalogMap],
  );

  const selectedFileSummary = useMemo(() => {
    if (!selectedFiles.length) return "";
    if (selectedFiles.length === 1) {
      return `${selectedFiles[0].name} · ${Math.max(1, Math.round(selectedFiles[0].size / 1024))} KB`;
    }
    const totalBytes = selectedFiles.reduce((sum, item) => sum + Number(item?.size || 0), 0);
    return `${selectedFiles.length} 个文件 · ${Math.max(1, Math.round(totalBytes / 1024))} KB`;
  }, [selectedFiles]);
  const hasVideoSelection = useMemo(
    () =>
      selectedFiles.some((file) => {
        const type = String(file?.type || "").toLowerCase();
        const name = String(file?.name || "");
        return type.startsWith("video/") || /\.(mp4|mov|mkv|avi|webm)$/i.test(name);
      }),
    [selectedFiles],
  );

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    const nextFiles = Array.from(event.target.files || []);
    setSelectedFiles(nextFiles);
    setStatus(nextFiles.length > 0 ? `已选择 ${nextFiles.length} 个媒体文件` : "");
    setError("");
    event.target.value = "";
  }

  async function handleSubmit() {
    if (!accessToken) {
      setError("请先登录后再使用 ASR 文本识别");
      return;
    }
    if (selectedFiles.length === 0) {
      setError("请先选择至少一个媒体文件");
      return;
    }

    setLoading(true);
    setUploadPercent(0);
    setError("");
    setStatus("正在上传并识别媒体...");
    setResultRecord(null);

    try {
      const form = new FormData();
      for (const file of selectedFiles) {
        form.append("files", file, file.name);
      }
      form.append("model", selectedModel);
      form.append("output_mode", outputMode);
      form.append("include_timestamps", String(includeTimestamps));
      form.append("include_filename_headers", String(includeFilenameHeaders));

      const { ok, data } = await uploadWithProgress(
        "/api/asr-records/transcribe",
        {
          method: "POST",
          body: form,
          onUploadProgress: ({ percent }) => {
            setUploadPercent(Math.max(0, Math.min(100, Number(percent || 0))));
          },
        },
        accessToken,
      );

      if (!ok) {
        throw new Error(`${data?.error_code || "ERROR"}: ${data?.message || "批量识别失败"}`);
      }

      const nextRecord = data?.record || null;
      if (!nextRecord) {
        throw new Error("服务端未返回识别结果");
      }
      setResultRecord(nextRecord);
      setActiveViewMode(String(nextRecord.output_mode || outputMode || "per_file"));
      setStatus(buildResultSummaryText(nextRecord));
      setUploadPercent(100);
      toast.success(nextRecord.record_status === "failed" ? "识别完成，结果已写入历史" : "识别完成");
    } catch (submitError) {
      const message = submitError instanceof Error && submitError.message ? submitError.message : "批量识别失败";
      setError(message);
      setStatus("");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={LOCAL_ASR_FILE_ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        disabled={loading}
      />

      <div className="rounded-2xl border bg-muted/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">仅 ASR 结果</p>
            <p className="text-xs text-muted-foreground">支持单个或多个音频或视频文件，输出逐文件结果或合并全文，并保留到历史记录。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-9 px-4" onClick={openFilePicker} disabled={loading}>
              <Files className="size-4" />
              选择媒体文件
            </Button>
            {resultRecord ? (
              <Button type="button" variant="secondary" className="h-9 px-4" onClick={onOpenHistory}>
                <History className="size-4" />
                查看历史记录
              </Button>
            ) : null}
          </div>
        </div>

        {selectedFiles.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{selectedFiles.length} 个文件</Badge>
              {selectedFileSummary ? <Badge variant="outline">{selectedFileSummary}</Badge> : null}
              {hasVideoSelection ? (
                <Badge variant="outline" className="gap-1">
                  <Video className="size-3.5" />
                  包含视频
                </Badge>
              ) : null}
            </div>
            {hasVideoSelection ? <p className="text-xs text-muted-foreground">检测到视频素材，系统会先自动抽取音轨再进行识别。</p> : null}
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file) => (
                <Badge key={`${file.name}-${file.size}-${file.lastModified}`} variant="secondary">
                  {file.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-2xl border bg-background/90 p-4">
          <p className="text-sm font-medium">识别模型</p>
          <Select value={selectedModel} onValueChange={onSelectedModelChange} disabled={loading}>
            <SelectTrigger className="h-11 rounded-2xl">
              <SelectValue placeholder="选择 ASR 模型" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {modelOptions.find((item) => item.key === selectedModel)?.subtitle ? (
            <p className="text-xs text-muted-foreground">{modelOptions.find((item) => item.key === selectedModel)?.subtitle}</p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-2xl border bg-background/90 p-4">
          <p className="text-sm font-medium">输出模式</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={outputMode === "per_file" ? "default" : "outline"} className="h-9 px-4" disabled={loading} onClick={() => setOutputMode("per_file")}>
              逐文件结果
            </Button>
            <Button type="button" variant={outputMode === "merged" ? "default" : "outline"} className="h-9 px-4" disabled={loading} onClick={() => setOutputMode("merged")}>
              合并全文
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">自定义格式</p>
          <p className="text-xs text-muted-foreground">这些开关会同时影响当前页展示、复制内容和历史记录保存格式。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
            <input
              type="checkbox"
              checked={includeTimestamps}
              onChange={(event) => setIncludeTimestamps(event.target.checked)}
              disabled={loading}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">显示时间戳</span>
              <span className="block text-xs text-muted-foreground">复制时保留 `[00:00.000 - 00:01.000]` 结构</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
            <input
              type="checkbox"
              checked={includeFilenameHeaders}
              onChange={(event) => setIncludeFilenameHeaders(event.target.checked)}
              disabled={loading}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">显示文件名分隔</span>
              <span className="block text-xs text-muted-foreground">多文件场景会插入 `### 文件名` 分隔标题</span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10 px-4" onClick={() => void handleSubmit()} disabled={loading || selectedFiles.length === 0}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              识别中
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <AudioLines className="size-4" />
              开始识别
            </span>
          )}
        </Button>
        {resultRecord?.merged_text ? (
          <Button type="button" variant="outline" className="h-10 px-4" onClick={() => void copyToClipboard(resultRecord.merged_text, "已复制全部结果")} disabled={loading}>
            <Copy className="size-4" />
            复制全部
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2 rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">上传与识别进度</p>
            <span className="text-sm font-semibold tabular-nums">{uploadPercent}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${uploadPercent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{status || "正在上传媒体并等待云端识别..."}</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {status && !loading ? (
        <div
          className={cn(
            "rounded-2xl border p-4 text-sm",
            resultRecord?.record_status === "failed"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : resultRecord?.record_status === "partial"
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {status}
        </div>
      ) : null}

      {resultRecord ? (
        <div className="space-y-4 rounded-2xl border bg-background/90 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{resultRecord.summary?.file_count || 0} 个文件</Badge>
            <Badge variant="outline">成功 {resultRecord.summary?.success_count || 0}</Badge>
            {Number(resultRecord.summary?.failure_count || 0) > 0 ? <Badge variant="outline">失败 {resultRecord.summary?.failure_count || 0}</Badge> : null}
            {resultRecord.include_timestamps ? <Badge variant="outline">带时间戳</Badge> : null}
            {resultRecord.include_filename_headers ? <Badge variant="outline">带文件名分隔</Badge> : null}
          </div>

          <div className="inline-flex rounded-2xl border bg-muted/20 p-1">
            <button
              type="button"
              className={cn("rounded-xl px-3 py-1.5 text-sm transition-colors", activeViewMode === "per_file" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              onClick={() => setActiveViewMode("per_file")}
            >
              逐文件结果
            </button>
            <button
              type="button"
              className={cn("rounded-xl px-3 py-1.5 text-sm transition-colors", activeViewMode === "merged" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              onClick={() => setActiveViewMode("merged")}
            >
              合并全文
            </button>
          </div>

          {activeViewMode === "merged" ? (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button type="button" variant="outline" className="h-9 px-3" onClick={() => void copyToClipboard(resultRecord.merged_text, "已复制合并全文")}>
                  <Copy className="size-4" />
                  复制合并全文
                </Button>
              </div>
              <Textarea value={String(resultRecord.merged_text || "")} readOnly className="min-h-[280px] rounded-2xl font-mono text-xs leading-6" />
            </div>
          ) : (
            <div className="space-y-3">
              {(Array.isArray(resultRecord.items) ? resultRecord.items : []).map((item) => (
                <div key={item.id} className="space-y-3 rounded-2xl border p-4">
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
                  <Textarea value={String(item.rendered_text || "")} readOnly className="min-h-[180px] rounded-2xl font-mono text-xs leading-6" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
