import { Loader2, UploadCloud } from "lucide-react";
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
    console.debug("[DEBUG] 打开链接生成视频提示弹窗");
    setLinkDialogOpen(true);
  }

  function jumpToRecommendedTool() {
    console.debug("[DEBUG] 跳转链接转视频工具网站", "https://snapany.com/zh");
    window.open("https://snapany.com/zh", "_blank", "noopener,noreferrer");
    setLinkDialogOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" />
          导入素材并生成练习
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <div className="overflow-hidden rounded-md border bg-muted/20">
            {coverDataUrl ? (
              <img src={coverDataUrl} alt="视频封面" className="h-40 w-full object-cover" />
            ) : (
              <div className="flex h-40 w-full items-center justify-center text-sm text-muted-foreground">
                {isVideoSource ? "封面提取中或失败" : "音频素材（无视频封面）"}
              </div>
            )}
          </div>
        ) : null}

        <form
          className="space-y-3"
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
            <Button type="button" variant="outline" className="h-11" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              选择文件
            </Button>
            <Button type="button" variant="secondary" className="h-11" onClick={openLinkDialog} disabled={loading}>
              链接生成视频
            </Button>
            {file ? <p className="text-xs text-muted-foreground">{file.name}</p> : null}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">开启语义分句</p>
              <p className="text-xs text-muted-foreground">更贴近语义，但会更慢，且可能增加模型调用。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{semanticSplitEnabled ? "已开启" : "已关闭"}</span>
              <Switch checked={semanticSplitEnabled} onCheckedChange={setSemanticSplitEnabled} disabled={loading} />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
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
          <p className="text-sm text-muted-foreground">{status}</p>
        </CardFooter>
      ) : null}
    </Card>
  );
}
