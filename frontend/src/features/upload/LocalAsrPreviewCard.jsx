import { Loader2, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { getLocalAsrPreviewState, saveLocalAsrPreviewState } from "../../shared/media/localAsrPreviewStore";
import { Button, ScrollArea } from "../../shared/ui";

const LOCAL_ASR_MODEL_ID = "local-sensevoice-small";
const LOCAL_ASR_MODEL_LABEL = "SenseVoice Small";
const DEFAULT_LOCAL_ASR_ASSET_BASE_URL =
  "https://www.modelscope.cn/studios/csukuangfj/web-assembly-vad-asr-sherpa-onnx-zh-en-jp-ko-cantonese-sense-voice/resolve/master";
const LOCAL_ASR_ASSET_BASE_URL = (import.meta.env.VITE_LOCAL_ASR_MODEL_BASE_URL || DEFAULT_LOCAL_ASR_ASSET_BASE_URL).trim().replace(/\/+$/, "");
const LOCAL_ASR_FILE_ACCEPT = "audio/*,video/mp4,.mp4,.m4a,.mp3,.wav,.aac,.ogg,.flac,.opus";
const LOCAL_ASR_TARGET_SAMPLE_RATE = 16000;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function detectLocalAsrPreviewSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "当前环境不支持浏览器本地 ASR 试玩", browserName: "", webgpuSupported: false };
  }
  const userAgent = String(navigator.userAgent || "");
  const isMobile = Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const isEdge = /\bEdg\//.test(userAgent);
  const isChrome = /\bChrome\//.test(userAgent) && !/\bEdg\//.test(userAgent) && !/\bOPR\//.test(userAgent);
  const browserName = isEdge ? "Edge" : isChrome ? "Chrome" : "";
  const webgpuSupported = typeof navigator.gpu !== "undefined";
  if (isMobile) {
    return { supported: false, reason: "本地 ASR 试玩仅支持桌面端 Chrome / Edge", browserName, webgpuSupported };
  }
  if (!browserName) {
    return { supported: false, reason: "当前仅支持桌面 Chrome / Edge 试玩本地 ASR", browserName: "", webgpuSupported };
  }
  return { supported: true, reason: "", browserName, webgpuSupported };
}

function getLocalModelStatusLabel(status) {
  if (status === "loading") return "下载中";
  if (status === "ready") return "已就绪";
  if (status === "cached") return "已缓存";
  if (status === "error") return "下载失败";
  if (status === "unsupported") return "不可用";
  return "未下载";
}

function formatRuntimeLabel(runtime) {
  if (runtime === "webgpu") return "WebGPU";
  if (runtime === "wasm") return "WASM";
  return "-";
}

function formatPreviewTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = safeMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function mixAudioBufferToMono(audioBuffer) {
  const channelCount = Math.max(1, Number(audioBuffer?.numberOfChannels || 1));
  const sampleCount = Math.max(0, Number(audioBuffer?.length || 0));
  if (sampleCount <= 0) return new Float32Array(0);
  if (channelCount === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }
  const mixed = new Float32Array(sampleCount);
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      mixed[sampleIndex] += channelData[sampleIndex] / channelCount;
    }
  }
  return mixed;
}

function resampleFloat32(samples, sourceSampleRate, targetSampleRate) {
  const safeSourceSampleRate = Math.max(1, Number(sourceSampleRate || 0));
  const safeTargetSampleRate = Math.max(1, Number(targetSampleRate || 0));
  if (!(samples instanceof Float32Array)) return new Float32Array(0);
  if (!samples.length || safeSourceSampleRate === safeTargetSampleRate) {
    return new Float32Array(samples);
  }
  const ratio = safeSourceSampleRate / safeTargetSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const interpolation = position - leftIndex;
    output[index] = samples[leftIndex] * (1 - interpolation) + samples[rightIndex] * interpolation;
  }
  return output;
}

async function decodeFileForLocalAsr(file) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("当前浏览器不支持 AudioContext，无法试玩本地 ASR");
  }
  const audioContext = new AudioContextCtor();
  try {
    const fileBytes = await file.arrayBuffer();
    let audioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(fileBytes.slice(0));
    } catch (error) {
      const isMp4 = String(file?.type || "").toLowerCase() === "video/mp4" || /\.mp4$/i.test(String(file?.name || ""));
      if (isMp4) {
        throw new Error("当前 MP4 编码无法本地试玩，请改传音频或使用云端识别。");
      }
      throw new Error(`本地解析音频失败: ${error instanceof Error && error.message ? error.message : String(error)}`);
    }
    const mono = mixAudioBufferToMono(audioBuffer);
    return resampleFloat32(mono, audioBuffer.sampleRate, LOCAL_ASR_TARGET_SAMPLE_RATE);
  } finally {
    try {
      await audioContext.close();
    } catch (_) {
      // Ignore audio context close failures.
    }
  }
}

function buildWorkerRequestId(sequence) {
  return `local-asr-${Date.now()}-${sequence}`;
}

export function LocalAsrPreviewCard({ disabled = false }) {
  const localAsrSupport = useMemo(() => detectLocalAsrPreviewSupport(), []);
  const [localModelStatus, setLocalModelStatus] = useState(localAsrSupport.supported ? "idle" : "unsupported");
  const [localModelStatusText, setLocalModelStatusText] = useState(localAsrSupport.supported ? "尚未下载本地 SenseVoice" : localAsrSupport.reason);
  const [localModelProgress, setLocalModelProgress] = useState(null);
  const [localModelRuntime, setLocalModelRuntime] = useState("");
  const [localModelError, setLocalModelError] = useState("");
  const [localPreviewFile, setLocalPreviewFile] = useState(null);
  const [localPreviewPhase, setLocalPreviewPhase] = useState("idle");
  const [localPreviewStatusText, setLocalPreviewStatusText] = useState(localAsrSupport.supported ? "下载模型后可在本地试玩字幕预览" : localAsrSupport.reason);
  const [localPreviewText, setLocalPreviewText] = useState("");
  const [localPreviewSegments, setLocalPreviewSegments] = useState([]);
  const [localPreviewRuntime, setLocalPreviewRuntime] = useState("");
  const [localPreviewWarning, setLocalPreviewWarning] = useState("SenseVoice 本地模式当前使用 WASM 运行，首次下载会稍慢。");
  const localPreviewInputRef = useRef(null);
  const localAsrWorkerRef = useRef(null);
  const localAsrRequestSequenceRef = useRef(0);
  const localAsrPendingRequestsRef = useRef(new Map());
  const localAsrModelPromiseRef = useRef(null);
  const localPreviewBusy = localModelStatus === "loading" || localPreviewPhase === "decoding" || localPreviewPhase === "transcribing";
  const localPreviewHasResult = localPreviewPhase === "success" && localPreviewSegments.length > 0;

  function rejectPendingRequests(message) {
    const error = new Error(message || "本地 ASR Worker 不可用");
    for (const [, request] of localAsrPendingRequestsRef.current.entries()) {
      request.reject(error);
    }
    localAsrPendingRequestsRef.current.clear();
    localAsrModelPromiseRef.current = null;
  }

  async function persistLocalAsrState(overrides = {}) {
    if (!localAsrSupport.supported) return;
    try {
      await saveLocalAsrPreviewState(LOCAL_ASR_MODEL_ID, {
        status: String(overrides.status || localModelStatus || "idle"),
        runtime: String(overrides.runtime || localModelRuntime || ""),
        webgpu_supported: Boolean(overrides.webgpuSupported ?? localAsrSupport.webgpuSupported),
        browser_supported: Boolean(overrides.browserSupported ?? localAsrSupport.supported),
        last_error: String(overrides.lastError || localModelError || ""),
        user_agent: String(navigator?.userAgent || ""),
      });
    } catch (_) {
      // Ignore local cache write failures.
    }
  }

  function createWorkerRequest(type, payload = {}, transfer = []) {
    if (!localAsrWorkerRef.current) {
      return Promise.reject(new Error("本地 ASR Worker 未初始化"));
    }
    localAsrRequestSequenceRef.current += 1;
    const requestId = buildWorkerRequestId(localAsrRequestSequenceRef.current);
    return new Promise((resolve, reject) => {
      localAsrPendingRequestsRef.current.set(requestId, { resolve, reject, type });
      localAsrWorkerRef.current.postMessage(
        { type, requestId, modelId: LOCAL_ASR_MODEL_ID, preferredRuntime: "wasm", assetBaseUrl: LOCAL_ASR_ASSET_BASE_URL, ...payload },
        transfer,
      );
    });
  }

  async function ensureModelReady() {
    if (!localAsrSupport.supported) {
      throw new Error(localAsrSupport.reason || "当前浏览器不支持本地 ASR 试玩");
    }
    if (localAsrModelPromiseRef.current) {
      return localAsrModelPromiseRef.current;
    }
    setLocalModelStatus("loading");
    setLocalModelStatusText("正在检查并下载本地 ASR 模型");
    setLocalModelProgress(null);
    setLocalModelError("");
    const promise = createWorkerRequest("load-model")
      .then((result) => {
        const runtime = String(result?.runtime || "");
        setLocalModelStatus("ready");
        setLocalModelStatusText(runtime === "wasm" ? "模型已就绪，当前使用 WASM，速度会较慢" : "模型已就绪，可直接试玩");
        setLocalModelProgress(100);
        setLocalModelRuntime(runtime);
        if (runtime === "wasm") {
          setLocalPreviewWarning("SenseVoice 本地模式当前使用 WASM 运行，首次下载会稍慢。");
        }
        void persistLocalAsrState({ status: "ready", runtime, lastError: "" });
        return result;
      })
      .catch(async (error) => {
        const message = error instanceof Error && error.message ? error.message : String(error);
        setLocalModelStatus("error");
        setLocalModelStatusText("本地 ASR 模型下载或加载失败");
        setLocalModelProgress(null);
        setLocalModelError(message);
        await persistLocalAsrState({ status: "error", runtime: "", lastError: message });
        throw error;
      })
      .finally(() => {
        localAsrModelPromiseRef.current = null;
      });
    localAsrModelPromiseRef.current = promise;
    return promise;
  }

  useEffect(() => {
    if (!localAsrSupport.supported) return undefined;
    const worker = new Worker(new URL("./localAsrPreviewWorker.js", import.meta.url));
    localAsrWorkerRef.current = worker;

    const handleMessage = (event) => {
      const payload = event?.data || {};
      const requestId = String(payload?.requestId || "");
      const pending = requestId ? localAsrPendingRequestsRef.current.get(requestId) : null;
      if (payload?.type === "progress") {
        if (payload.stage === "model-load-start") {
          setLocalModelStatus("loading");
          setLocalModelStatusText(String(payload.status_text || "正在下载本地 ASR 模型"));
          setLocalModelRuntime(String(payload.runtime || ""));
          return;
        }
        if (payload.stage === "model-progress") {
          setLocalModelStatus("loading");
          setLocalModelProgress(Number.isFinite(Number(payload.progress)) ? clampPercent(payload.progress) : null);
          const fileLabel = String(payload.file || "").split("/").pop() || "模型文件";
          const percentText = Number.isFinite(Number(payload.progress)) ? `${clampPercent(payload.progress)}%` : "准备中";
          setLocalModelStatusText(`正在下载 ${fileLabel} · ${percentText}`);
          setLocalModelRuntime(String(payload.runtime || ""));
          return;
        }
        if (payload.stage === "runtime-fallback") {
          setLocalPreviewWarning("SenseVoice 本地模式当前使用 WASM 运行，首次下载会稍慢。");
          setLocalModelStatusText(String(payload.status_text || "SenseVoice 当前使用 WASM 运行"));
          setLocalModelRuntime(String(payload.runtime || "wasm"));
          return;
        }
        if (payload.stage === "transcribe-start") {
          setLocalPreviewPhase("transcribing");
          setLocalPreviewStatusText(String(payload.status_text || "正在本地识别字幕"));
          setLocalPreviewRuntime(String(payload.runtime || localPreviewRuntime || ""));
        }
        return;
      }
      if (payload?.type === "result") {
        if (pending) {
          localAsrPendingRequestsRef.current.delete(requestId);
          pending.resolve(payload);
        }
        return;
      }
      if (payload?.type === "error") {
        if (payload.action === "load-model") {
          setLocalModelStatus("error");
          setLocalModelStatusText("本地 ASR 模型下载或加载失败");
          setLocalModelProgress(null);
          setLocalModelError(String(payload.message || "模型加载失败"));
        }
        if (payload.action === "transcribe-audio") {
          setLocalPreviewPhase("error");
          setLocalPreviewStatusText(String(payload.message || "本地字幕试玩失败"));
        }
        if (pending) {
          localAsrPendingRequestsRef.current.delete(requestId);
          pending.reject(new Error(String(payload.message || "本地 ASR Worker 失败")));
        }
      }
    };

    const handleWorkerError = (event) => {
      const message = event?.message || "本地 ASR Worker 运行失败";
      setLocalModelStatus("error");
      setLocalModelStatusText("本地 ASR Worker 启动失败");
      setLocalModelProgress(null);
      setLocalModelError(message);
      setLocalPreviewPhase("error");
      setLocalPreviewStatusText(message);
      rejectPendingRequests(message);
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      rejectPendingRequests("本地 ASR Worker 已关闭");
      worker.terminate();
      if (localAsrWorkerRef.current === worker) {
        localAsrWorkerRef.current = null;
      }
    };
  }, [localAsrSupport.supported]);

  useEffect(() => {
    let canceled = false;
    async function restoreCachedState() {
      if (!localAsrSupport.supported) return;
      try {
        const cachedState = await getLocalAsrPreviewState(LOCAL_ASR_MODEL_ID);
        if (canceled || !cachedState) return;
        const runtime = String(cachedState.runtime || "");
        const lastError = String(cachedState.last_error || "");
        setLocalModelRuntime(runtime);
        if (String(cachedState.status || "") === "ready") {
          setLocalModelStatus("cached");
          setLocalModelProgress(100);
          setLocalModelStatusText(runtime === "wasm" ? "模型已缓存，上次使用 WASM 运行" : "模型已缓存，可直接试玩");
          if (runtime === "wasm") {
            setLocalPreviewWarning("SenseVoice 本地模式当前使用 WASM 运行，首次下载会稍慢。");
          }
          return;
        }
        if (String(cachedState.status || "") === "error" && lastError) {
          setLocalModelStatus("error");
          setLocalModelStatusText("上次本地 ASR 模型加载失败，可重试下载");
          setLocalModelError(lastError);
        }
      } catch (_) {
        // Ignore cache read failures.
      }
    }
    void restoreCachedState();
    return () => {
      canceled = true;
    };
  }, [localAsrSupport.supported]);

  async function handleDownloadModel() {
    try {
      const result = await ensureModelReady();
      setLocalPreviewStatusText("模型已就绪，选择本地音频或 MP4 文件即可试玩字幕预览");
      setLocalPreviewRuntime(String(result?.runtime || ""));
      toast.success("本地 SenseVoice 已准备好");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      setLocalPreviewPhase("error");
      setLocalPreviewStatusText(message);
      toast.error(message);
    }
  }

  async function runLocalPreview(file) {
    if (!file) return;
    if (!localAsrSupport.supported) {
      const message = localAsrSupport.reason || "当前浏览器不支持本地 ASR 试玩";
      setLocalPreviewPhase("error");
      setLocalPreviewStatusText(message);
      toast.error(message);
      return;
    }
    setLocalPreviewFile(file);
    setLocalPreviewSegments([]);
    setLocalPreviewText("");
    setLocalPreviewRuntime("");
    setLocalPreviewPhase("decoding");
    setLocalPreviewStatusText("正在本地解析音频");
    try {
      const readyResult = await ensureModelReady();
      setLocalPreviewRuntime(String(readyResult?.runtime || ""));
      const audioData = await decodeFileForLocalAsr(file);
      if (!(audioData instanceof Float32Array) || audioData.length <= 0) {
        throw new Error("本地音频解析结果为空，无法试玩字幕预览");
      }
      setLocalPreviewPhase("transcribing");
      setLocalPreviewStatusText("正在本地识别字幕");
      const result = await createWorkerRequest("transcribe-audio", { audioData, samplingRate: LOCAL_ASR_TARGET_SAMPLE_RATE, fileName: String(file.name || "") }, [audioData.buffer]);
      const segments = Array.isArray(result?.segments) ? result.segments : [];
      const previewText = String(result?.preview_text || "").trim();
      const runtime = String(result?.runtime || "");
      setLocalPreviewSegments(segments);
      setLocalPreviewText(previewText);
      setLocalPreviewRuntime(runtime);
      setLocalPreviewPhase("success");
      setLocalPreviewStatusText(segments.length > 0 ? `本地识别完成，共 ${segments.length} 段字幕` : "本地识别完成，但未得到可用字幕");
      if (runtime === "wasm") {
        setLocalPreviewWarning("SenseVoice 本地模式当前使用 WASM 运行，首次下载会稍慢。");
      }
      await persistLocalAsrState({ status: "ready", runtime, lastError: "" });
      if (segments.length > 0) {
        toast.success("本地字幕预览已生成");
      } else {
        toast.warning("识别完成，但没有得到可用字幕段落");
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      setLocalPreviewPhase("error");
      setLocalPreviewStatusText(message);
      setLocalPreviewSegments([]);
      setLocalPreviewText("");
      toast.error(message.includes("MP4") ? message : `本地 ASR 试玩失败: ${message}`);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (localPreviewInputRef.current) {
      localPreviewInputRef.current.value = "";
    }
    await runLocalPreview(file);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-dashed bg-muted/10 p-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">本地 ASR 试玩</p>
            <p className="text-xs text-muted-foreground">
              下载 {LOCAL_ASR_MODEL_LABEL} 后，可在桌面 {localAsrSupport.browserName || "Chrome / Edge"} 本地跑字幕预览，不上传媒体文件。
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              localModelStatus === "ready" || localModelStatus === "cached"
                ? "bg-emerald-500/10 text-emerald-700"
                : localModelStatus === "error"
                  ? "bg-red-500/10 text-red-600"
                  : localModelStatus === "loading"
                    ? "bg-amber-500/10 text-amber-700"
                    : "bg-muted text-muted-foreground",
            )}
          >
            {getLocalModelStatusLabel(localModelStatus)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{localModelStatusText}</p>
        {localModelRuntime ? <p className="text-xs text-muted-foreground">当前运行时：{formatRuntimeLabel(localModelRuntime)}</p> : null}
        {localPreviewWarning ? <p className="text-xs text-amber-700">{localPreviewWarning}</p> : null}
        {localModelError ? <p className="text-xs text-destructive">{localModelError}</p> : null}
      </div>

      {localModelStatus === "loading" ? (
        <div className="space-y-2">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber-500 transition-[width] duration-300" style={{ width: `${clampPercent(localModelProgress ?? 0)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {Number.isFinite(localModelProgress) ? `模型下载进度 ${clampPercent(localModelProgress)}%` : "正在准备本地模型缓存"}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void handleDownloadModel()} disabled={!localAsrSupport.supported || localPreviewBusy || disabled}>
          {localModelStatus === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
          {localModelStatus === "ready" || localModelStatus === "cached" ? "重新校验模型" : "下载模型"}
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (localPreviewInputRef.current) {
              localPreviewInputRef.current.value = "";
              localPreviewInputRef.current.click();
            }
          }}
          disabled={!localAsrSupport.supported || localPreviewBusy || disabled}
        >
          {localPreviewBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          选择本地文件试玩
        </Button>
        {localPreviewFile ? (
          <Button type="button" variant="ghost" onClick={() => void runLocalPreview(localPreviewFile)} disabled={!localAsrSupport.supported || localPreviewBusy || disabled}>
            <RefreshCcw className="size-4" />
            重新识别当前文件
          </Button>
        ) : null}
      </div>

      <input ref={localPreviewInputRef} type="file" className="hidden" accept={LOCAL_ASR_FILE_ACCEPT} onChange={(event) => { void handleFileChange(event); }} />

      <div className="space-y-2 rounded-xl border bg-background/80 p-3">
        <p className="text-xs text-muted-foreground">支持音频与常见 MP4；若 MP4 本地音轨不可解码，会提示改传音频或继续使用云端识别。</p>
        {localPreviewFile ? <p className="text-sm font-medium">{localPreviewFile.name}</p> : <p className="text-sm text-muted-foreground">尚未选择本地试玩文件</p>}
        <p className={cn("text-sm", localPreviewPhase === "error" ? "text-destructive" : "text-muted-foreground")}>{localPreviewStatusText}</p>
        {localPreviewRuntime ? <p className="text-xs text-muted-foreground">本次运行时：{formatRuntimeLabel(localPreviewRuntime)}</p> : null}
      </div>

      {localPreviewHasResult ? (
        <div className="space-y-3 rounded-xl border bg-background/80 p-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">字幕预览</p>
            <p className="text-xs text-muted-foreground">{localPreviewText || "本次预览未生成摘要文本"}</p>
          </div>
          <ScrollArea className="h-72 rounded-lg border bg-muted/20">
            <div className="space-y-2 p-3">
              {localPreviewSegments.map((segment) => (
                <div key={segment.id || `${segment.begin_ms}-${segment.end_ms}-${segment.text}`} className="rounded-lg border bg-background p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatPreviewTime(segment.begin_ms)} - {formatPreviewTime(segment.end_ms)}
                  </p>
                  <p className="mt-1 text-sm leading-6">{segment.text}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
