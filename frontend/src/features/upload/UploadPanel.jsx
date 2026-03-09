import { Loader2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { api, parseResponse, toErrorText, uploadWithProgress } from "../../shared/api/client";
import {
  extractMediaCoverDataUrl,
  getLessonMediaPreview,
  readMediaDurationSeconds,
  requestPersistentStorage,
  saveLessonMedia,
} from "../../shared/media/localMediaStore";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui";

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

function calculatePointsBySeconds(seconds, pointsPerMinute) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pointsPerMinute) || pointsPerMinute <= 0) {
    return 0;
  }
  const roundedSeconds = Math.ceil(seconds);
  return Math.ceil((roundedSeconds * pointsPerMinute) / 60);
}

function getRateByModel(rates, modelName) {
  return rates.find((item) => item.model_name === modelName && item.is_active);
}

function getStageItems(taskSnapshot) {
  const stageStatusMap = Object.fromEntries(
    (Array.isArray(taskSnapshot?.stages) ? taskSnapshot.stages : []).map((item) => [item.key, item.status || "pending"]),
  );
  return DISPLAY_STAGES.map((item) => ({ ...item, status: stageStatusMap[item.key] || "pending" }));
}

function getCurrentTaskStageKey(taskSnapshot) {
  const stageItems = getStageItems(taskSnapshot);
  const runningStage = stageItems.find((item) => item.status === "running");
  if (runningStage) return runningStage.key;

  const failedStage = stageItems.find((item) => item.status === "failed");
  if (failedStage) return failedStage.key;

  const firstPendingIndex = stageItems.findIndex((item) => item.status === "pending");
  if (firstPendingIndex > 0) return stageItems[firstPendingIndex - 1].key;
  if (firstPendingIndex === -1) return "write_lesson";
  return stageItems[firstPendingIndex].key;
}

function getStageStatusText(status) {
  if (status === "completed") return "已完成";
  if (status === "running") return "进行中";
  if (status === "failed") return "失败";
  return "待开始";
}

function getStageCardClass(status) {
  if (status === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  }
  if (status === "running") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  }
  if (status === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-600";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function getProgressBarClass(phase) {
  if (phase === "success") return "bg-emerald-500";
  if (phase === "error") return "bg-red-500";
  if (phase === "uploading") return "bg-sky-500";
  if (phase === "processing") return "bg-amber-500";
  return "bg-muted-foreground/20";
}

function getVisualProgress(phase, uploadPercent, taskSnapshot) {
  if (phase === "success") return 100;

  const taskPercent = clampPercent(taskSnapshot?.overall_percent);
  if (phase === "processing" || taskSnapshot) {
    return Math.round(42 + taskPercent * 0.58);
  }

  const safeUploadPercent = clampPercent(uploadPercent);
  if (phase === "uploading") {
    return Math.round(Math.max(3, Math.min(42, safeUploadPercent * 0.42)));
  }

  if (phase === "error" && safeUploadPercent > 0) {
    return Math.round(Math.max(3, Math.min(42, safeUploadPercent * 0.42)));
  }

  return 0;
}

function getProgressHeadline(phase, uploadPercent, taskSnapshot) {
  if (phase === "uploading") {
    return `上传素材 ${clampPercent(uploadPercent)}%`;
  }

  if (!taskSnapshot) {
    if (phase === "success") return "生成课程完成";
    if (phase === "error") return "生成课程失败";
    return "等待上传";
  }

  if (phase === "success") {
    return "生成课程完成";
  }

  const counters = taskSnapshot.counters || {};
  const stageKey = getCurrentTaskStageKey(taskSnapshot);

  if (stageKey === "asr_transcribe") {
    const segmentDone = Math.max(0, Number(counters.segment_done || 0));
    const segmentTotal = Math.max(segmentDone, Number(counters.segment_total || 0));
    if (segmentTotal > 0) {
      return `识别分段 ${segmentDone}/${segmentTotal}`;
    }

    const done = Math.max(0, Number(counters.asr_done || 0));
    const total = Math.max(done, Number(counters.asr_estimated || 0));
    if (done > 0 && total > 0) {
      return `识别字幕 ${done}/${total}`;
    }
    return String(taskSnapshot.current_text || "识别中");
  }

  if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    return total > 0 ? `翻译字幕 ${done}/${total}` : String(taskSnapshot.current_text || "翻译字幕");
  }

  if (stageKey === "convert_audio") {
    return "转换音频";
  }

  if (stageKey === "write_lesson") {
    return "生成课程";
  }

  return String(taskSnapshot.current_text || "等待处理");
}

function getProgressAssistiveText({ phase, uploadPercent, progressPercent, taskSnapshot, headline }) {
  if (phase === "uploading") {
    return `上传素材 ${clampPercent(uploadPercent)}%，总进度 ${progressPercent}%`;
  }

  if (taskSnapshot) {
    const currentText = String(taskSnapshot.current_text || "").trim();
    const detail = currentText && currentText !== headline ? `${headline}，${currentText}` : headline;
    return `${detail}，总进度 ${progressPercent}%`;
  }

  if (phase === "success") {
    return "课程生成成功，进度 100%";
  }

  if (phase === "error") {
    return "课程生成失败";
  }

  return "等待上传";
}

function buildUnpersistedMediaPreview(lessonId, file, previewCoverDataUrl, fallbackFileName = "") {
  return {
    lessonId: Number(lessonId) || 0,
    hasMedia: false,
    mediaType: String(file?.type || ""),
    coverDataUrl: String(previewCoverDataUrl || ""),
    fileName: String(file?.name || fallbackFileName || ""),
  };
}

export function UploadPanel({ accessToken, onCreated, balancePoints, billingRates, subtitleSettings, onWalletChanged }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [probing, setProbing] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [semanticSplitEnabled, setSemanticSplitEnabled] = useState(Boolean(subtitleSettings?.semantic_split_default_enabled));
  const [uploadPercent, setUploadPercent] = useState(0);

  const pollingAbortRef = useRef(false);
  const uploadAbortRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedRate = getRateByModel(billingRates, QWEN_MODEL);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;
  const stageItems = getStageItems(taskSnapshot);
  const progressPercent = getVisualProgress(phase, uploadPercent, taskSnapshot);
  const progressHeadline = getProgressHeadline(phase, uploadPercent, taskSnapshot);
  const progressBarClass = getProgressBarClass(phase);
  const progressAssistiveText = getProgressAssistiveText({
    phase,
    uploadPercent,
    progressPercent,
    taskSnapshot,
    headline: progressHeadline,
  });
  const showProgress = loading || phase === "success" || phase === "error" || Boolean(taskSnapshot);

  useEffect(() => {
    return () => {
      pollingAbortRef.current = true;
      uploadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setSemanticSplitEnabled(Boolean(subtitleSettings?.semantic_split_default_enabled));
  }, [subtitleSettings?.semantic_split_default_enabled]);

  async function pollTask(taskId) {
    if (!taskId || pollingAbortRef.current) return;

    try {
      const resp = await api(`/api/lessons/tasks/${taskId}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (pollingAbortRef.current) return;
      if (!resp.ok) {
        const message = toErrorText(data, "查询任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        return;
      }

      setTaskSnapshot(data);
      setPhase("processing");
      const taskStatus = String(data.status || "").toLowerCase();
      if (taskStatus === "succeeded") {
        setPhase("success");
        let mediaPersisted = false;
        let mediaPreview = null;
        let successMessage = "";

        if (data.lesson?.id && file && data.lesson.media_storage === "client_indexeddb") {
          try {
            await requestPersistentStorage();
            await saveLessonMedia(data.lesson.id, file, { coverDataUrl });
            mediaPreview = await getLessonMediaPreview(data.lesson.id);
            mediaPersisted = Boolean(mediaPreview?.hasMedia);
          } catch (_) {
            mediaPreview = buildUnpersistedMediaPreview(data.lesson.id, file, coverDataUrl, data.lesson.source_filename);
          }
        }

        if (data.lesson?.media_storage === "client_indexeddb" && !mediaPersisted) {
          successMessage = "课程已生成，但当前浏览器未保存本地视频，请在历史记录中恢复视频后再开始学习。";
        }

        setStatus(successMessage);
        setLoading(false);
        await onWalletChanged?.();
        if (data.lesson) {
          await onCreated?.({
            lesson: data.lesson,
            mediaPreview,
            mediaPersisted,
          });
        }
        if (successMessage) {
          toast.warning(successMessage);
        } else {
          toast.success("课程已生成");
        }
        return;
      }

      if (taskStatus === "failed") {
        const message = `${data.error_code || "ERROR"}: ${data.message || "生成失败"}`;
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await onWalletChanged?.();
        return;
      }

      setTimeout(() => {
        void pollTask(taskId);
      }, 1000);
    } catch (error) {
      if (pollingAbortRef.current || error?.name === "AbortError") return;
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
    }
  }

  async function onSelectFile(nextFile) {
    uploadAbortRef.current?.abort();
    setFile(nextFile);
    setStatus("");
    setDurationSec(null);
    setTaskSnapshot(null);
    setCoverDataUrl("");
    setIsVideoSource(false);
    setUploadPercent(0);

    if (!nextFile) {
      setPhase("idle");
      return;
    }

    setPhase("probing");
    setProbing(true);
    try {
      const [seconds, cover] = await Promise.all([
        readMediaDurationSeconds(nextFile, nextFile.name || ""),
        extractMediaCoverDataUrl(nextFile, nextFile.name || ""),
      ]);
      setDurationSec(seconds);
      setCoverDataUrl(cover);
      setIsVideoSource(String(nextFile.type || "").startsWith("video/"));
      setPhase("ready");
    } catch (_) {
      setDurationSec(null);
      setCoverDataUrl("");
      setIsVideoSource(String(nextFile.type || "").startsWith("video/"));
      setPhase("ready");
    } finally {
      setProbing(false);
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
      const { ok, data } = await uploadWithProgress(
        "/api/lessons/tasks",
        {
          method: "POST",
          body: form,
          signal: abortController.signal,
          onUploadProgress: ({ percent }) => {
            setUploadPercent(percent);
          },
        },
        accessToken,
      );
      uploadAbortRef.current = null;

      if (!ok) {
        const message = toErrorText(data, "创建上传任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await onWalletChanged?.();
        return;
      }

      const taskId = String(data.task_id || "");
      if (!taskId) {
        const message = "任务创建成功但缺少 task_id";
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        return;
      }

      setUploadPercent(100);
      setPhase("processing");
      void pollTask(taskId);
    } catch (error) {
      uploadAbortRef.current = null;
      if (error?.name === "AbortError") return;
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
    }
  }

  function openLinkDialog() {
    setLinkDialogOpen(true);
  }

  function jumpToRecommendedTool() {
    window.open("https://snapany.com/zh", "_blank", "noopener,noreferrer");
    setLinkDialogOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" />
          上传素材
        </CardTitle>
        <CardDescription>导入视频或音频后，系统会自动识别、翻译并生成可学习课程。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <p className="text-muted-foreground">当前余额：{Number(balancePoints || 0)} 点</p>
            <p className="text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">预估扣费</span>
                </TooltipTrigger>
                <TooltipContent>向上取整秒数后按分钟计费，再向上取整到点数。</TooltipContent>
              </Tooltip>
              ：
              {selectedRate
                ? probing
                  ? "读取时长中..."
                  : durationSec != null
                    ? `${estimatedPoints} 点（${selectedRate.points_per_minute} 点/分钟）`
                    : "选择文件后显示"
                : "该模型未配置单价"}
            </p>
            {likelyInsufficient ? <p className="mt-1 text-destructive">余额可能不足，提交将被拒绝。</p> : null}
          </AlertDescription>
        </Alert>

        {file ? (
          <div className="overflow-hidden rounded-2xl border bg-muted/20">
            {coverDataUrl ? (
              <img src={coverDataUrl} alt="视频封面" className="h-52 w-full object-cover" />
            ) : (
              <div className="flex h-52 w-full items-center justify-center text-sm text-muted-foreground">
                {isVideoSource ? "封面提取中或失败" : "音频素材（无视频封面）"}
              </div>
            )}
          </div>
        ) : null}

        {showProgress ? (
          <div className="space-y-3 rounded-2xl border bg-muted/15 p-4" title={progressAssistiveText}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{progressHeadline}</p>
                <p className="text-xs text-muted-foreground">总进度</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{progressPercent}%</span>
            </div>

            <div
              role="progressbar"
              aria-label={progressAssistiveText}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn("h-full rounded-full transition-[width,background-color] duration-300", progressBarClass)}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {stageItems.map((item) => (
                <div
                  key={item.key}
                  className={cn("rounded-xl border px-3 py-2 text-sm font-medium transition-colors", getStageCardClass(item.status))}
                  title={`${item.label}：${getStageStatusText(item.status)}`}
                >
                  {item.label}
                </div>
              ))}
            </div>

            <span className="sr-only">
              {progressAssistiveText}；{stageItems.map((item) => `${item.label}${getStageStatusText(item.status)}`).join("；")}
            </span>
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <input
              id="asr-file"
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
              disabled={loading}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                选择文件
              </Button>
              <Button type="button" variant="secondary" className="h-11" onClick={openLinkDialog} disabled={loading}>
                链接生成视频
              </Button>
            </div>
            {file ? <p className="text-xs text-muted-foreground">{file.name}</p> : null}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">开启语义分句</p>
              <p className="text-xs text-muted-foreground">更贴近语义，但会更慢，且可能增加模型调用。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{semanticSplitEnabled ? "已开启" : "已关闭"}</span>
              <Switch checked={semanticSplitEnabled} onCheckedChange={setSemanticSplitEnabled} disabled={loading} />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-11 w-full">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                生成中
              </span>
            ) : (
              "开始生成课程"
            )}
          </Button>
        </form>

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>链接生成视频</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1">
                  <p>上传视频才可以获取素材</p>
                  <p>您可自行寻找可以链接转视频的合法工具</p>
                  <p>或使用推荐的工具网站</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLinkDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={jumpToRecommendedTool}>
                跳转
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
      {phase === "error" && status ? (
        <CardFooter>
          <p className="text-sm text-destructive">{status}</p>
        </CardFooter>
      ) : null}
    </Card>
  );
}
