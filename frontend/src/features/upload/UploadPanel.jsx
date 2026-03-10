import { CheckCircle2, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { api, parseResponse, toErrorText, uploadWithProgress } from "../../shared/api/client";
import { clearActiveGenerationTask, getActiveGenerationTask, saveActiveGenerationTask } from "../../shared/media/localTaskStore";
import { extractMediaCoverPreview, getLessonMediaPreview, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MediaCover, Switch, Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui";

const QWEN_MODEL = "qwen3-asr-flash-filetrans";
const DISPLAY_STAGES = [
  { key: "convert_audio", label: "转换" },
  { key: "asr_transcribe", label: "识别" },
  { key: "translate_zh", label: "翻译" },
  { key: "write_lesson", label: "生成" },
];

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function getRateByModel(rates, modelName) {
  return rates.find((item) => item.model_name === modelName && item.is_active);
}

function calculatePointsBySeconds(seconds, pointsPerMinute) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pointsPerMinute) || pointsPerMinute <= 0) return 0;
  return Math.ceil((Math.ceil(seconds) * pointsPerMinute) / 60);
}

function getStageItems(taskSnapshot) {
  const map = Object.fromEntries((Array.isArray(taskSnapshot?.stages) ? taskSnapshot.stages : []).map((item) => [item.key, item.status || "pending"]));
  return DISPLAY_STAGES.map((item) => ({ ...item, status: map[item.key] || "pending" }));
}

function getCurrentTaskStageKey(taskSnapshot) {
  const items = getStageItems(taskSnapshot);
  return items.find((item) => item.status === "running")?.key || items.find((item) => item.status === "failed")?.key || items.find((item) => item.status !== "completed")?.key || "write_lesson";
}

function getProgressHeadline(phase, uploadPercent, taskSnapshot) {
  if (phase === "uploading") return `上传素材 ${clampPercent(uploadPercent)}%`;
  if (!taskSnapshot) return phase === "success" ? "生成课程完成" : phase === "error" ? "生成课程失败" : "等待上传";
  if (phase === "success") return "生成课程完成";
  const counters = taskSnapshot.counters || {};
  const stageKey = getCurrentTaskStageKey(taskSnapshot);
  if (stageKey === "asr_transcribe") {
    const segmentDone = Math.max(0, Number(counters.segment_done || 0));
    const segmentTotal = Math.max(segmentDone, Number(counters.segment_total || 0));
    if (segmentTotal > 0) return `识别分段 ${segmentDone}/${segmentTotal}`;
    const done = Math.max(0, Number(counters.asr_done || 0));
    const total = Math.max(done, Number(counters.asr_estimated || 0));
    return done > 0 && total > 0 ? `识别字幕 ${done}/${total}` : String(taskSnapshot.current_text || "识别中");
  }
  if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    return total > 0 ? `翻译字幕 ${done}/${total}` : String(taskSnapshot.current_text || "翻译字幕");
  }
  return stageKey === "convert_audio" ? "转换音频" : stageKey === "write_lesson" ? "生成课程" : String(taskSnapshot.current_text || "等待处理");
}

function getVisualProgress(phase, uploadPercent, taskSnapshot) {
  if (phase === "success") return 100;
  if (phase === "processing" || taskSnapshot) return Math.round(42 + clampPercent(taskSnapshot?.overall_percent) * 0.58);
  if (phase === "uploading") return Math.round(Math.max(3, Math.min(42, clampPercent(uploadPercent) * 0.42)));
  return 0;
}

function createFileFromBlob(blob, fileName, mediaType) {
  if (!(blob instanceof Blob)) return null;
  try {
    return new File([blob], String(fileName || "source.bin"), { type: String(mediaType || blob.type || ""), lastModified: Date.now() });
  } catch (_) {
    return blob;
  }
}

function buildTaskState({ phase, taskId, taskSnapshot, uploadPercent, status }) {
  if (!taskId && !taskSnapshot && phase === "idle") return null;
  return {
    taskId: String(taskId || taskSnapshot?.task_id || ""),
    phase,
    headline: getProgressHeadline(phase, uploadPercent, taskSnapshot),
    progressPercent: getVisualProgress(phase, uploadPercent, taskSnapshot),
    statusText: status,
    taskSnapshot,
    lessonId: Number(taskSnapshot?.lesson?.id || 0),
    resumeAvailable: Boolean(taskSnapshot?.resume_available),
  };
}

export function UploadPanel({ accessToken, onCreated, balancePoints, billingRates, subtitleSettings, onWalletChanged, onTaskStateChange, onNavigateToLesson }) {
  const [file, setFile] = useState(null);
  const [taskId, setTaskId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [coverAspectRatio, setCoverAspectRatio] = useState(0);
  const [coverWidth, setCoverWidth] = useState(0);
  const [coverHeight, setCoverHeight] = useState(0);
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState(null);
  const [semanticSplitEnabled, setSemanticSplitEnabled] = useState(Boolean(subtitleSettings?.semantic_split_default_enabled));
  const [uploadPercent, setUploadPercent] = useState(0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [bindingCompleted, setBindingCompleted] = useState(false);
  const pollingAbortRef = useRef(false);
  const uploadAbortRef = useRef(null);
  const fileInputRef = useRef(null);
  const restoredRef = useRef(false);

  const selectedRate = getRateByModel(billingRates, QWEN_MODEL);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;
  const stageItems = getStageItems(taskSnapshot);
  const progressPercent = getVisualProgress(phase, uploadPercent, taskSnapshot);
  const showProgress = loading || phase === "success" || phase === "error" || Boolean(taskSnapshot);
  const canResume = Boolean(taskSnapshot?.resume_available && taskId);

  useEffect(() => {
    onTaskStateChange?.(buildTaskState({ phase, taskId, taskSnapshot, uploadPercent, status }));
  }, [onTaskStateChange, phase, taskId, taskSnapshot, uploadPercent, status]);

  useEffect(() => () => {
    pollingAbortRef.current = true;
    uploadAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    setSemanticSplitEnabled(Boolean(subtitleSettings?.semantic_split_default_enabled));
  }, [subtitleSettings?.semantic_split_default_enabled]);

  async function persistSession(overrides = {}) {
    const nextFile = overrides.file ?? file;
    const nextTaskId = overrides.taskId ?? taskId;
    const nextPhase = overrides.phase ?? phase;
    if (!nextFile && !nextTaskId && nextPhase === "idle") {
      await clearActiveGenerationTask();
      return;
    }
    await saveActiveGenerationTask({
      task_id: nextTaskId,
      phase: nextPhase,
      task_snapshot: overrides.taskSnapshot ?? taskSnapshot,
      file_blob: nextFile instanceof Blob ? nextFile : null,
      file_name: String(nextFile?.name || ""),
      media_type: String(nextFile?.type || ""),
      cover_data_url: String(overrides.coverDataUrl ?? coverDataUrl ?? ""),
      cover_width: Number(overrides.coverWidth ?? coverWidth ?? 0),
      cover_height: Number(overrides.coverHeight ?? coverHeight ?? 0),
      aspect_ratio: Number(overrides.aspectRatio ?? coverAspectRatio ?? 0),
      duration_seconds: Number(overrides.durationSec ?? durationSec ?? 0),
      is_video_source: Boolean(overrides.isVideoSource ?? isVideoSource),
      upload_percent: Number(overrides.uploadPercent ?? uploadPercent ?? 0),
      status_text: String(overrides.status ?? status ?? ""),
      semantic_split_enabled: Boolean(overrides.semanticSplitEnabled ?? semanticSplitEnabled),
      binding_completed: Boolean(overrides.bindingCompleted ?? bindingCompleted),
    });
  }

  async function resetSession() {
    pollingAbortRef.current = true;
    uploadAbortRef.current?.abort();
    setFile(null);
    setTaskId("");
    setLoading(false);
    setStatus("");
    setDurationSec(null);
    setPhase("idle");
    setCoverDataUrl("");
    setCoverAspectRatio(0);
    setCoverWidth(0);
    setCoverHeight(0);
    setIsVideoSource(false);
    setTaskSnapshot(null);
    setUploadPercent(0);
    setBindingCompleted(false);
    await clearActiveGenerationTask();
  }

  async function finalizeSuccess(data, sourceFile = file, silentToast = false) {
    let mediaPersisted = false;
    let mediaPreview = null;
    let successMessage = "";
    if (data.lesson?.id && sourceFile && data.lesson.media_storage === "client_indexeddb" && !bindingCompleted) {
      try {
        await requestPersistentStorage();
        await saveLessonMedia(data.lesson.id, sourceFile, { coverDataUrl, coverWidth, coverHeight, aspectRatio: coverAspectRatio });
        mediaPreview = await getLessonMediaPreview(data.lesson.id);
        mediaPersisted = Boolean(mediaPreview?.hasMedia);
      } catch (_) {
        mediaPreview = { lessonId: Number(data.lesson.id || 0), hasMedia: false, mediaType: String(sourceFile?.type || ""), coverDataUrl, aspectRatio: coverAspectRatio, fileName: String(sourceFile?.name || data.lesson.source_filename || "") };
      }
    }
    if (data.lesson?.media_storage === "client_indexeddb" && !mediaPersisted) successMessage = "课程已生成，但当前浏览器未保存本地视频，请在历史记录中恢复视频后再开始学习。";
    setTaskSnapshot(data);
    setPhase("success");
    setStatus(successMessage);
    setLoading(false);
    setBindingCompleted(Boolean(mediaPersisted || data.lesson?.media_storage !== "client_indexeddb"));
    await persistSession({ phase: "success", taskSnapshot: data, bindingCompleted: Boolean(mediaPersisted || data.lesson?.media_storage !== "client_indexeddb"), status: successMessage });
    await onWalletChanged?.();
    if (data.lesson) await onCreated?.({ lesson: data.lesson, mediaPreview, mediaPersisted });
    if (!silentToast) (successMessage ? toast.warning(successMessage) : toast.success("课程已生成"));
  }

  async function pollTask(nextTaskId, silentToast = false) {
    if (!nextTaskId || pollingAbortRef.current) return;
    try {
      const resp = await api(`/api/lessons/tasks/${nextTaskId}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (pollingAbortRef.current) return;
      if (!resp.ok) {
        const message = toErrorText(data, "查询任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        await persistSession({ phase: "error", status: message });
        if (!silentToast) toast.error(message);
        return;
      }
      setTaskId(String(data.task_id || nextTaskId));
      setTaskSnapshot(data);
      const taskStatus = String(data.status || "").toLowerCase();
      if (taskStatus === "succeeded") {
        await finalizeSuccess(data, file, silentToast);
        return;
      }
      if (taskStatus === "failed") {
        const message = `${data.error_code || "ERROR"}: ${data.message || "生成失败"}`;
        setStatus(message);
        setPhase("error");
        setLoading(false);
        await persistSession({ phase: "error", taskSnapshot: data, status: message });
        await onWalletChanged?.();
        if (!silentToast) toast.error(message);
        return;
      }
      setPhase("processing");
      setLoading(true);
      await persistSession({ phase: "processing", taskSnapshot: data, uploadPercent: 100 });
      setTimeout(() => void pollTask(nextTaskId, silentToast), 1000);
    } catch (error) {
      if (pollingAbortRef.current || error?.name === "AbortError") return;
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      await persistSession({ phase: "error", status: message });
      if (!silentToast) toast.error(message);
    }
  }

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let canceled = false;
    async function restoreSession() {
      const saved = await getActiveGenerationTask();
      if (!saved || canceled) return;
      const restoredFile = createFileFromBlob(saved.file_blob, saved.file_name, saved.media_type);
      setFile(restoredFile);
      setTaskId(String(saved.task_id || ""));
      setStatus(String(saved.status_text || ""));
      setDurationSec(Number(saved.duration_seconds || 0) || null);
      setPhase(String(saved.phase || "idle"));
      setCoverDataUrl(String(saved.cover_data_url || ""));
      setCoverWidth(Number(saved.cover_width || 0));
      setCoverHeight(Number(saved.cover_height || 0));
      setCoverAspectRatio(Number(saved.aspect_ratio || 0));
      setIsVideoSource(Boolean(saved.is_video_source));
      setTaskSnapshot(saved.task_snapshot || null);
      setUploadPercent(Number(saved.upload_percent || 0));
      setBindingCompleted(Boolean(saved.binding_completed));
      setLoading(["uploading", "processing"].includes(String(saved.phase || "")));
      if (
        saved.task_id &&
        (["pending", "running"].includes(String(saved.task_snapshot?.status || "").toLowerCase()) ||
          ["processing", "uploading"].includes(String(saved.phase || "").toLowerCase()))
      ) {
        pollingAbortRef.current = false;
        void pollTask(String(saved.task_id), true);
      } else if (saved.task_id && String(saved.task_snapshot?.status || "").toLowerCase() === "succeeded" && !saved.binding_completed) {
        await finalizeSuccess(saved.task_snapshot, restoredFile, true);
      }
    }
    void restoreSession();
    return () => {
      canceled = true;
    };
  }, []);

  async function onSelectFile(nextFile) {
    uploadAbortRef.current?.abort();
    setFile(nextFile);
    setTaskId("");
    setStatus("");
    setDurationSec(null);
    setTaskSnapshot(null);
    setCoverDataUrl("");
    setCoverAspectRatio(0);
    setCoverWidth(0);
    setCoverHeight(0);
    setIsVideoSource(false);
    setUploadPercent(0);
    setBindingCompleted(false);
    if (!nextFile) {
      setPhase("idle");
      await clearActiveGenerationTask();
      return;
    }
    setPhase("probing");
    try {
      const [seconds, cover] = await Promise.all([readMediaDurationSeconds(nextFile, nextFile.name || ""), extractMediaCoverPreview(nextFile, nextFile.name || "")]);
      setDurationSec(seconds);
      setCoverDataUrl(String(cover.coverDataUrl || ""));
      setCoverWidth(Number(cover.width || 0));
      setCoverHeight(Number(cover.height || 0));
      setCoverAspectRatio(Number(cover.aspectRatio || 0));
      setIsVideoSource(String(nextFile.type || "").startsWith("video/"));
      setPhase("ready");
      await persistSession({ file: nextFile, phase: "ready", durationSec: seconds, coverDataUrl: cover.coverDataUrl, coverWidth: cover.width, coverHeight: cover.height, aspectRatio: cover.aspectRatio, isVideoSource: String(nextFile.type || "").startsWith("video/") });
    } catch (_) {
      setPhase("ready");
      setIsVideoSource(String(nextFile.type || "").startsWith("video/"));
      await persistSession({ file: nextFile, phase: "ready", isVideoSource: String(nextFile.type || "").startsWith("video/") });
    }
  }

  async function submit() {
    if (!file) {
      const message = "请先选择文件";
      setStatus(message);
      setPhase("error");
      toast.error(message);
      return;
    }
    pollingAbortRef.current = false;
    uploadAbortRef.current?.abort();
    setLoading(true);
    setStatus("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("asr_model", QWEN_MODEL);
      form.append("semantic_split_enabled", semanticSplitEnabled ? "true" : "false");
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const { ok, data } = await uploadWithProgress("/api/lessons/tasks", { method: "POST", body: form, signal: abortController.signal, onUploadProgress: ({ percent }) => setUploadPercent(percent) }, accessToken);
      uploadAbortRef.current = null;
      if (!ok) {
        const message = toErrorText(data, "创建上传任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        await onWalletChanged?.();
        return;
      }
      const nextTaskId = String(data.task_id || "");
      if (!nextTaskId) {
        const message = "任务创建成功但缺少 task_id";
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        return;
      }
      setTaskId(nextTaskId);
      setUploadPercent(100);
      setPhase("processing");
      await persistSession({ taskId: nextTaskId, phase: "processing", uploadPercent: 100 });
      void pollTask(nextTaskId);
    } catch (error) {
      uploadAbortRef.current = null;
      if (error?.name === "AbortError") return;
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
    }
  }

  async function resumeTask() {
    if (!taskId) return;
    setLoading(true);
    setStatus("");
    try {
      const resp = await api(`/api/lessons/tasks/${taskId}/resume`, { method: "POST" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "继续生成失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        return;
      }
      setPhase("processing");
      await persistSession({ phase: "processing", uploadPercent: 100, status: "" });
      void pollTask(taskId);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UploadCloud className="size-4" />上传素材</CardTitle>
        <CardDescription>导入视频或音频后，系统会自动识别、翻译并生成可学习课程。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <p className="text-muted-foreground">当前余额：{Number(balancePoints || 0)} 点</p>
            <p className="text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-2">预估扣费</span></TooltipTrigger>
                <TooltipContent>向上取整秒数后按分钟计费，再向上取整到点数。</TooltipContent>
              </Tooltip>
              ：{selectedRate ? (durationSec != null ? `${estimatedPoints} 点（${selectedRate.points_per_minute} 点/分钟）` : "选择文件后显示") : "该模型未配置单价"}
            </p>
            {likelyInsufficient ? <p className="mt-1 text-destructive">余额可能不足，提交将被拒绝。</p> : null}
          </AlertDescription>
        </Alert>

        {file ? <MediaCover coverDataUrl={coverDataUrl} alt={isVideoSource ? "视频封面" : "音频素材"} aspectRatio={coverAspectRatio} className="border bg-muted/20" fallback={<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">{isVideoSource ? "封面提取中或失败" : "音频素材（无视频封面）"}</div>} /> : null}

        {showProgress ? (
          <div className="space-y-3 rounded-2xl border bg-muted/15 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1"><p className="text-sm font-medium">{getProgressHeadline(phase, uploadPercent, taskSnapshot)}</p><p className="text-xs text-muted-foreground">总进度</p></div>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width,background-color] duration-300", phase === "success" ? "bg-emerald-500" : phase === "error" ? "bg-red-500" : phase === "uploading" ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${progressPercent}%` }} /></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{stageItems.map((item) => <div key={item.key} className={cn("rounded-xl border px-3 py-2 text-sm font-medium", item.status === "completed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : item.status === "running" ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : item.status === "failed" ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-border bg-muted/30 text-muted-foreground")}>{item.label}</div>)}</div>
          </div>
        ) : null}

        {phase === "success" && taskSnapshot?.lesson ? (
          <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /><div className="space-y-1"><p className="text-sm font-semibold text-emerald-700">生成成功</p><p className="text-sm text-emerald-700/80">{status || "课程已写入历史记录，你可以现在开始学习，或继续上传下一份素材。"}</p></div></div>
            <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => onNavigateToLesson?.(taskSnapshot.lesson.id)}>去学习</Button><Button type="button" variant="outline" onClick={() => void resetSession()}>继续上传</Button></div>
          </div>
        ) : null}

        {phase === "error" && status ? (
          <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{status}</p>
            <div className="flex flex-wrap gap-2">
              {canResume ? <Button type="button" onClick={() => void resumeTask()}><RefreshCcw className="size-4" />继续生成</Button> : null}
              <Button type="button" variant="outline" onClick={() => void resetSession()}>重新开始</Button>
            </div>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="grid gap-2">
            <input id="asr-file" ref={fileInputRef} type="file" className="hidden" onChange={(event) => { void onSelectFile(event.target.files?.[0] ?? null); }} disabled={loading} />
            <div className="grid gap-2 md:grid-cols-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => fileInputRef.current?.click()} disabled={loading}>选择文件</Button>
              <Button type="button" variant="secondary" className="h-11" onClick={() => setLinkDialogOpen(true)} disabled={loading}>链接生成视频</Button>
            </div>
            {file ? <p className="text-xs text-muted-foreground">{file.name}</p> : null}
          </div>
          <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
            <div className="space-y-1"><p className="text-sm font-medium">开启语义分句</p><p className="text-xs text-muted-foreground">更贴近语义，但会更慢，且可能增加模型调用。</p></div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{semanticSplitEnabled ? "已开启" : "已关闭"}</span><Switch checked={semanticSplitEnabled} onCheckedChange={setSemanticSplitEnabled} disabled={loading} /></div>
          </div>
          <Button type="submit" disabled={loading || phase === "success"} className="h-11 w-full">{loading ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />生成中</span> : phase === "success" ? "已生成完成" : "开始生成课程"}</Button>
        </form>

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>链接生成视频</DialogTitle>
              <DialogDescription asChild><div className="space-y-1"><p>上传视频才可以获取素材</p><p>您可自行寻找可以链接转视频的合法工具</p><p>或使用推荐的工具网站</p></div></DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLinkDialogOpen(false)}>取消</Button>
              <Button type="button" onClick={() => window.open("https://snapany.com/zh", "_blank", "noopener,noreferrer")}>跳转</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
