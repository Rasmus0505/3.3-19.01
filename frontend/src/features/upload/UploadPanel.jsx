import { Loader2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui";

const QWEN_MODEL = "qwen3-asr-flash-filetrans";

const LOCAL_PHASE_PROGRESS = {
  idle: 0,
  probing: 20,
  ready: 35,
  submitting: 50,
  success: 100,
  error: 100,
};

const LOCAL_PHASE_LABEL = {
  idle: "等待上传",
  probing: "读取媒体信息",
  ready: "可提交",
  submitting: "创建上传任务",
  success: "生成成功",
  error: "生成失败",
};

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

function stageStatusClass(status) {
  if (status === "completed") return "text-green-600";
  if (status === "running") return "text-foreground";
  if (status === "failed") return "text-destructive";
  return "text-muted-foreground";
}

export function UploadPanel({ accessToken, onCreated, balancePoints, billingRates, onWalletChanged }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [probing, setProbing] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState(null);

  const pollingAbortRef = useRef(false);

  const selectedRate = getRateByModel(billingRates, QWEN_MODEL);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;

  const progressValue = taskSnapshot?.overall_percent ?? LOCAL_PHASE_PROGRESS[phase] ?? 0;
  const phaseLabel = taskSnapshot?.current_text || LOCAL_PHASE_LABEL[phase] || "处理中";

  useEffect(() => {
    return () => {
      pollingAbortRef.current = true;
    };
  }, []);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" />
          导入素材并生成练习
        </CardTitle>
        <CardDescription>流程：抽音频 → ASR（时间戳）→ 逐句对齐 → 中文翻译。</CardDescription>
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

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>处理进度</span>
            <span>{phaseLabel}</span>
          </div>
          <Progress value={progressValue} />
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">{taskSnapshot?.current_text || "等待上传"}</p>
            {taskSnapshot?.stages?.length ? (
              <div className="flex flex-wrap gap-2">
                {taskSnapshot.stages.map((item) => (
                  <Badge key={item.key} variant="outline" className={stageStatusClass(item.status)}>
                    {item.label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="asr-model">模型</Label>
            <Input id="asr-model" value={QWEN_MODEL} disabled readOnly className="h-11" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asr-file">上传素材</Label>
            <Input
              id="asr-file"
              type="file"
              className="h-11 cursor-pointer py-2 file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-2.5 file:py-1 file:text-xs"
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
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
      </CardContent>
      <CardFooter>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : <p className="text-sm text-muted-foreground">等待上传</p>}
      </CardFooter>
    </Card>
  );
}
