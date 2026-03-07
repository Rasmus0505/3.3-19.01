import { Loader2, UploadCloud } from "lucide-react";
import { Coins, Link2, Sparkles, TimerReset, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
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

function readMediaDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("video") ? "video" : "audio");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number(media.duration || 0);
      URL.revokeObjectURL(objectUrl);
      resolve(duration > 0 ? duration : 0);
    };
    media.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("读取媒体时长失败"));
    };
    media.src = objectUrl;
  });
}

function extractVideoCoverDataUrl(file) {
  return new Promise((resolve) => {
    if (!String(file?.type || "").startsWith("video/")) {
      resolve("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, video.videoWidth || 640);
        canvas.height = Math.max(1, video.videoHeight || 360);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve("");
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        cleanup();
        resolve(dataUrl);
      } catch (_) {
        cleanup();
        resolve("");
      }
    };

    video.onerror = () => {
      cleanup();
      resolve("");
    };

    video.src = objectUrl;
  });
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

  const pollingAbortRef = useRef(false);
  const fileInputRef = useRef(null);

  const selectedRate = getRateByModel(billingRates, QWEN_MODEL);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;

  useEffect(() => {
    return () => {
      pollingAbortRef.current = true;
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
      if (!resp.ok) {
        const message = toErrorText(data, "查询任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        return;
      }

      setTaskSnapshot(data);
      const taskStatus = String(data.status || "").toLowerCase();
      if (taskStatus === "succeeded") {
        setPhase("success");
        setStatus("生成成功");
        setLoading(false);
        await onWalletChanged?.();
        if (data.lesson) {
          onCreated(data.lesson);
        }
        toast.success("课程已生成");
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
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
    }
  }

  async function onSelectFile(nextFile) {
    setFile(nextFile);
    setStatus("");
    setDurationSec(null);
    setTaskSnapshot(null);
    setCoverDataUrl("");
    setIsVideoSource(false);

    if (!nextFile) {
      setPhase("idle");
      return;
    }

    setPhase("probing");
    setProbing(true);
    try {
      const [seconds, cover] = await Promise.all([readMediaDurationSeconds(nextFile), extractVideoCoverDataUrl(nextFile)]);
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

    setLoading(true);
    setStatus("正在创建上传任务...");
    setTaskSnapshot(null);
    setPhase("submitting");

    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("asr_model", QWEN_MODEL);
      form.append("semantic_split_enabled", semanticSplitEnabled ? "true" : "false");

      const resp = await api("/api/lessons/tasks", { method: "POST", body: form }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
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

      setStatus("任务已创建，正在处理...");
      void pollTask(taskId);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
    }
  }

  async function saveLocalMediaForLesson(lessonId) {
    if (!lessonId || !file) return false;
    try {
      await requestPersistentStorage();
      await saveLessonMedia(lessonId, file);
      return true;
    } catch (_) {
      return false;
    }
  }

  useEffect(() => {
    if (!taskSnapshot?.lesson?.id) return;
    void saveLocalMediaForLesson(taskSnapshot.lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskSnapshot?.lesson?.id]);

  function openLinkDialog() {
    setLinkDialogOpen(true);
  }

  function jumpToRecommendedTool() {
    window.open("https://snapany.com/zh", "_blank", "noopener,noreferrer");
    setLinkDialogOpen(false);
  }

  const balanceValue = Number(balancePoints || 0);
  const estimatedLabel = selectedRate
    ? probing
      ? "读取时长中..."
      : durationSec != null
        ? `${estimatedPoints} 点（${selectedRate.points_per_minute} 点/分钟）`
        : "选择文件后显示"
    : "该模型未配置单价";

  return (
    <Card className="apple-panel">
      <CardHeader className="space-y-5">
        <div className="apple-kicker w-fit">
          <Sparkles className="size-3.5" />
          Create Lesson
        </div>
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UploadCloud className="size-4" />
            导入素材
          </CardTitle>
          <CardDescription className="max-w-md">上传、计费和转写逻辑保持不变，只把流程收敛成更清晰的一条主路径。</CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            默认模型 {QWEN_MODEL}
          </span>
          <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            {semanticSplitEnabled ? "语义分句已开启" : "语义分句已关闭"}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/70 bg-white/72 p-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
              <Coins className="size-3.5" />
              当前余额
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{balanceValue} 点</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/70 bg-white/72 p-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
              <TimerReset className="size-3.5" />
              预估扣费
            </p>
            <p className="mt-2 text-sm font-semibold tracking-tight text-slate-950">{estimatedLabel}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert className="border-white/75 bg-white/78">
          <AlertDescription className="space-y-2">
            <p className="text-sm leading-6 text-slate-600">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">计费说明</span>
                </TooltipTrigger>
                <TooltipContent>向上取整秒数后按分钟计费，再向上取整到点数。</TooltipContent>
              </Tooltip>
              ：保持现有结算逻辑不变。
            </p>
            {likelyInsufficient ? (
              <p className="text-sm font-medium text-destructive">余额可能不足，提交将被拒绝。</p>
            ) : (
              <p className="text-xs leading-5 text-slate-500">选择素材后会自动读取时长、封面与本地媒体缓存信息。</p>
            )}
          </AlertDescription>
        </Alert>

        {file ? (
          <div className="overflow-hidden rounded-[1.75rem] border border-white/72 bg-white/68 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.24)]">
            {coverDataUrl ? (
              <img src={coverDataUrl} alt="视频封面" className="h-44 w-full object-cover" />
            ) : (
              <div className="flex h-44 w-full items-center justify-center text-sm text-slate-500">
                {isVideoSource ? "封面提取中或失败" : "音频素材（无视频封面）"}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-white/75 bg-white/68 px-5 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <div className="mx-auto flex size-14 items-center justify-center rounded-[1.5rem] bg-slate-950 text-white shadow-[0_22px_44px_-30px_rgba(15,23,42,0.56)]">
              <Video className="size-5" />
            </div>
            <p className="mt-4 text-base font-semibold tracking-tight text-slate-950">先导入一段视频或音频</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">支持视频和音频素材。时长读取、封面提取和本地缓存逻辑保持现状。</p>
          </div>
        )}

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
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Button type="button" className="h-12" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <UploadCloud className="size-4" />
                导入本地素材
              </Button>
              <Button type="button" variant="outline" className="h-12" onClick={openLinkDialog} disabled={loading}>
                <Link2 className="size-4" />
                链接生成视频
              </Button>
            </div>
            {file ? (
              <div className="rounded-[1.1rem] border border-white/72 bg-white/72 px-3 py-2 text-xs text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                {file.name}
              </div>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-[1.5rem] border border-white/70 bg-white/72 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-950">开启语义分句</p>
              <p className="text-xs leading-5 text-slate-500">更贴近语义，但速度会稍慢，且可能增加模型调用。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{semanticSplitEnabled ? "已开启" : "已关闭"}</span>
              <Switch checked={semanticSplitEnabled} onCheckedChange={setSemanticSplitEnabled} disabled={loading} />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                处理中
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
      {status ? (
        <CardFooter>
          <p className="text-sm text-slate-500">{status}</p>
        </CardFooter>
      ) : null}
    </Card>
  );
}
