import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui";

const ASR_MODELS = [
  { value: "paraformer-v2", label: "paraformer-v2 (推荐，带时间戳)" },
  { value: "qwen3-asr-flash-filetrans", label: "qwen3-asr-flash-filetrans" },
];

const PHASE_PROGRESS = {
  idle: 0,
  probing: 25,
  ready: 45,
  submitting: 75,
  success: 100,
  error: 100,
};

const PHASE_LABEL = {
  idle: "等待上传",
  probing: "读取媒体时长",
  ready: "可提交",
  submitting: "正在生成",
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

export function UploadPanel({ accessToken, onCreated, balancePoints, billingRates, onWalletChanged }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState(ASR_MODELS[0].value);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [probing, setProbing] = useState(false);
  const [phase, setPhase] = useState("idle");

  const selectedRate = getRateByModel(billingRates, model);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;
  const progressValue = PHASE_PROGRESS[phase] ?? 0;

  async function onSelectFile(nextFile) {
    setFile(nextFile);
    setStatus("");
    setDurationSec(null);
    if (!nextFile) {
      setPhase("idle");
      return;
    }
    setPhase("probing");
    setProbing(true);
    try {
      const seconds = await readMediaDurationSeconds(nextFile);
      setDurationSec(seconds);
      setPhase("ready");
    } catch (_) {
      setDurationSec(null);
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
    setStatus("AI 正在生成课程...");
    setPhase("submitting");
    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("asr_model", model);
      const resp = await api("/api/lessons", { method: "POST", body: form }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "生成失败");
        setStatus(message);
        setPhase("error");
        toast.error(message);
        await onWalletChanged?.();
        return;
      }

      let localMediaSaved = false;
      try {
        await requestPersistentStorage();
        await saveLessonMedia(data.lesson.id, file);
        localMediaSaved = true;
      } catch (_) {
        // Ignore local media save failure. User can re-bind local media later.
      }

      setPhase("success");
      if (localMediaSaved) {
        setStatus("课程生成成功，已为你自动进入学习页。");
        toast.success("课程生成成功，已为你自动进入学习页。");
      } else {
        setStatus("课程已创建，但本地媒体保存失败，需要重新绑定。");
        toast.warning("课程已创建，但本地媒体保存失败，需要重新绑定。");
      }
      await onWalletChanged?.();
      onCreated(data.lesson);
    } catch (error) {
      const message = "网络连接异常，请重试。";
      setStatus(message);
      setPhase("error");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" />
          上传音视频，生成课程
        </CardTitle>
        <CardDescription>系统会自动转写、切句并生成中文释义。</CardDescription>
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
                <TooltipContent>
                  按素材时长计费，结果向上取整到点数。
                </TooltipContent>
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
            {likelyInsufficient ? <p className="mt-1 text-destructive">当前余额不足，无法开始生成。请先兑换点数。</p> : null}
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>处理进度</span>
            <span>{PHASE_LABEL[phase] || "处理中"}</span>
          </div>
          <Progress value={progressValue} />
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="asr-model">模型选择</Label>
            <Select value={model} onValueChange={setModel} disabled={loading}>
              <SelectTrigger id="asr-model">
                <SelectValue placeholder="请选择模型" />
              </SelectTrigger>
              <SelectContent>
                {ASR_MODELS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                生成中
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
