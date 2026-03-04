import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, Select } from "../../shared/ui";

const ASR_MODELS = [
  { value: "paraformer-v2", label: "paraformer-v2 (推荐，带时间戳)" },
  { value: "qwen3-asr-flash-filetrans", label: "qwen3-asr-flash-filetrans" },
];

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

  const selectedRate = getRateByModel(billingRates, model);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;

  async function onSelectFile(nextFile) {
    setFile(nextFile);
    setStatus("");
    setDurationSec(null);
    if (!nextFile) return;
    setProbing(true);
    try {
      const seconds = await readMediaDurationSeconds(nextFile);
      setDurationSec(seconds);
    } catch (_) {
      setDurationSec(null);
    } finally {
      setProbing(false);
    }
  }

  async function submit() {
    if (!file) {
      setStatus("请先选择文件");
      return;
    }
    setLoading(true);
    setStatus("AI 正在生成课程...");
    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("asr_model", model);
      const resp = await api("/api/lessons", { method: "POST", body: form }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setStatus(toErrorText(data, "生成失败"));
        await onWalletChanged?.();
        return;
      }
      setStatus("生成成功");
      await onWalletChanged?.();
      onCreated(data.lesson);
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

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
        <div className="rounded-md border border-input bg-muted/20 p-3 text-sm">
          <p className="text-muted-foreground">当前余额：{Number(balancePoints || 0)} 点</p>
          <p className="text-muted-foreground">
            预估扣费：
            {selectedRate
              ? probing
                ? "读取时长中..."
                : durationSec != null
                  ? `${estimatedPoints} 点（${selectedRate.points_per_minute} 点/分钟）`
                  : "选择文件后显示"
              : "该模型未配置单价"}
          </p>
          {likelyInsufficient ? <p className="mt-1 text-destructive">余额可能不足，提交将被拒绝。</p> : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="asr-model">模型选择</Label>
          <Select id="asr-model" value={model} onChange={(e) => setModel(e.target.value)} disabled={loading}>
            {ASR_MODELS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
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

        <Button onClick={submit} disabled={loading} className="w-full">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              生成中
            </span>
          ) : (
            "开始生成课程"
          )}
        </Button>
      </CardContent>
      <CardFooter>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : <p className="text-sm text-muted-foreground">等待上传</p>}
      </CardFooter>
    </Card>
  );
}
