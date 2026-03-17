import { CheckCircle2, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { api, parseResponse, toErrorText, uploadWithProgress } from "../../shared/api/client";
import { formatMoneyCents, formatMoneyPerMinute } from "../../shared/lib/money";
import { deleteLocalAsrPreviewState, getLocalAsrPreviewState, listLocalAsrPreviewStates, saveLocalAsrPreviewState } from "../../shared/media/localAsrPreviewStore";
import { extractMediaCoverPreview, getLessonMediaPreview, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import { clearActiveGenerationTask, getActiveGenerationTask, saveActiveGenerationTask } from "../../shared/media/localTaskStore";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MediaCover, Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui";
import { useAppStore } from "../../store";

const QWEN_MODEL = "qwen3-asr-flash-filetrans";
const UPLOAD_PROGRESS_PERSIST_INTERVAL_MS = 800;
const LOCAL_ASR_TARGET_SAMPLE_RATE = 16000;
const LOCAL_ASR_FILE_ACCEPT = "audio/*,video/mp4,.mp4,.m4a,.mp3,.wav,.aac,.ogg,.flac,.opus";
const LOCAL_MODEL_VISUAL_PROGRESS_INTERVAL_MS = 120;
const DEFAULT_LOCAL_ASR_ASSET_BASE_URL = "/static/local-asr-assets";
const LOCAL_ASR_ASSET_BASE_URL = (import.meta.env.VITE_LOCAL_ASR_MODEL_BASE_URL || DEFAULT_LOCAL_ASR_ASSET_BASE_URL).trim().replace(/\/+$/, "");
const LOCAL_MODEL_OPTIONS = [
  {
    key: "local-sensevoice-small",
    workerModelId: "local-sensevoice-small",
    title: "SenseVoice Small",
    subtitle: "最快，适合先试跑",
    sizeEstimateMb: { wasm: 180 },
    cacheFiles: [
      "sherpa-onnx-asr.js",
      "sherpa-onnx-wasm-main-vad-asr.js",
      "sherpa-onnx-wasm-main-vad-asr.wasm",
      "sherpa-onnx-wasm-main-vad-asr.data",
    ],
  },
  /*
  {
    key: "local-whisper-base-en",
    workerModelId: "onnx-community/whisper-base.en_timestamped",
    title: "Base",
    subtitle: "推荐默认档，速度和准确率更平衡",
    sizeEstimateMb: { webgpu: 290, wasm: 80 },
  },
  {
    key: "local-whisper-small-en",
    workerModelId: "onnx-community/whisper-small.en_timestamped",
    title: "Small",
    subtitle: "更准，但下载和首跑更重",
    sizeEstimateMb: { webgpu: 970, wasm: 250 },
  },
  {
    key: "local-whisper-medium-en",
    workerModelId: "onnx-community/whisper-medium.en_timestamped",
    title: "Medium",
    subtitle: "最重但更稳，适合高配置浏览器",
    sizeEstimateMb: { webgpu: 3150, wasm: 1000 },
  },
  */
];
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

function getLocalModelMeta(modelKey) {
  return LOCAL_MODEL_OPTIONS.find((item) => item.key === modelKey) || LOCAL_MODEL_OPTIONS[0];
}

function detectLocalAsrSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "当前环境不支持浏览器本地 ASR", browserName: "", webgpuSupported: false };
  }
  const userAgent = String(navigator.userAgent || "");
  const isMobile = Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const isEdge = /\bEdg\//.test(userAgent);
  const isChrome = /\bChrome\//.test(userAgent) && !/\bEdg\//.test(userAgent) && !/\bOPR\//.test(userAgent);
  const browserName = isEdge ? "Edge" : isChrome ? "Chrome" : "";
  const webgpuSupported = typeof navigator.gpu !== "undefined";
  if (isMobile) {
    return { supported: false, reason: "均衡模式仅支持桌面端 Chrome / Edge", browserName, webgpuSupported };
  }
  if (!browserName) {
    return { supported: false, reason: "均衡模式当前仅支持桌面 Chrome / Edge", browserName: "", webgpuSupported };
  }
  return { supported: true, reason: "", browserName, webgpuSupported };
}

function formatLocalModelEstimate(meta, support) {
  const preferredRuntime = support.webgpuSupported && Number(meta?.sizeEstimateMb?.webgpu || 0) > 0 ? "webgpu" : "wasm";
  const amountMb = Number(meta?.sizeEstimateMb?.[preferredRuntime] || 0);
  if (!amountMb) return "待确认";
  return amountMb >= 1024 ? `${(amountMb / 1024).toFixed(1)}GB` : `${amountMb}MB`;
}

function getLocalModelStatusLabel(status) {
  if (status === "loading") return "下载中";
  if (status === "ready" || status === "cached") return "已下载";
  if (status === "removing") return "卸载中";
  if (status === "error") return "异常";
  if (status === "unsupported") return "不可用";
  return "未下载";
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
    throw new Error("当前浏览器不支持 AudioContext，无法使用均衡模式");
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
        throw new Error("当前 MP4 音轨无法本地解码，请改传音频或切回高速模式。");
      }
      throw new Error(`本地解析音频失败: ${error instanceof Error && error.message ? error.message : String(error)}`);
    }
    const mono = mixAudioBufferToMono(audioBuffer);
    return resampleFloat32(mono, audioBuffer.sampleRate, LOCAL_ASR_TARGET_SAMPLE_RATE);
  } finally {
    try {
      await audioContext.close();
    } catch (_) {
      // ignore
    }
  }
}

function buildWorkerRequestId(sequence) {
  return `upload-local-asr-${Date.now()}-${sequence}`;
}

async function clearLocalModelCaches(modelMeta) {
  if (typeof caches === "undefined") return;
  const patterns = [
    LOCAL_ASR_ASSET_BASE_URL,
    encodeURIComponent(LOCAL_ASR_ASSET_BASE_URL),
    ...(Array.isArray(modelMeta?.cacheFiles) ? modelMeta.cacheFiles : []),
  ];
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => patterns.some((pattern) => request.url.includes(pattern)))
          .map((request) => cache.delete(request)),
      );
    }),
  );
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
  if (phase === "upload_paused") return `上传素材 ${clampPercent(uploadPercent)}%`;
  if (phase === "local_transcribing") return "均衡模式正在本地识别字幕";
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
  if (phase === "local_transcribing") return 28;
  if (phase === "processing" || taskSnapshot) return Math.round(42 + clampPercent(taskSnapshot?.overall_percent) * 0.58);
  if (phase === "uploading" || phase === "upload_paused") return Math.round(Math.max(3, Math.min(42, clampPercent(uploadPercent) * 0.42)));
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

export function UploadPanel({ accessToken, isActivePanel = true, onCreated, balanceAmountCents = 0, balancePoints, billingRates, subtitleSettings, onWalletChanged, onTaskStateChange, onNavigateToLesson }) {
  const currentUser = useAppStore((state) => state.currentUser);
  const normalizedBalanceAmountCents = Number(balanceAmountCents ?? balancePoints ?? 0);
  const localAsrSupport = useMemo(() => detectLocalAsrSupport(), []);
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
  const [uploadPercent, setUploadPercent] = useState(0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [bindingCompleted, setBindingCompleted] = useState(false);
  const [mode, setMode] = useState("balanced");
  const [selectedBalancedModel, setSelectedBalancedModel] = useState(() => {
    const configuredModel = String(subtitleSettings?.default_asr_model || "").trim();
    return configuredModel === LOCAL_MODEL_OPTIONS[0].key ? configuredModel : LOCAL_MODEL_OPTIONS[0].key;
  });
  const [localModelStateMap, setLocalModelStateMap] = useState({});
  const [localModelVisualProgressMap, setLocalModelVisualProgressMap] = useState({});
  const [localBusyModelKey, setLocalBusyModelKey] = useState("");
  const [localBusyText, setLocalBusyText] = useState("");
  const pollingAbortRef = useRef(false);
  const pollTokenRef = useRef(0);
  const uploadAbortRef = useRef(null);
  const uploadPersistRef = useRef({ timer: null, lastSavedAt: 0, lastSavedPercent: -1, latestPercent: 0 });
  const fileInputRef = useRef(null);
  const previousPanelActiveRef = useRef(Boolean(isActivePanel));
  const localAsrWorkerRef = useRef(null);
  const localAsrRequestSequenceRef = useRef(0);
  const localAsrPendingRequestsRef = useRef(new Map());
  const ownerUserId = Number(currentUser?.id || 0);

  const selectedFastModel = useMemo(() => {
    const configuredModel = String(subtitleSettings?.default_asr_model || "").trim();
    if (configuredModel === QWEN_MODEL && getRateByModel(billingRates, configuredModel)) return configuredModel;
    return getRateByModel(billingRates, QWEN_MODEL)?.model_name || QWEN_MODEL;
  }, [billingRates, subtitleSettings?.default_asr_model]);
  const selectedAsrModel = mode === "balanced" ? selectedBalancedModel : selectedFastModel;
  const selectedRate = getRateByModel(billingRates, selectedAsrModel) || getRateByModel(billingRates, selectedFastModel);
  const estimatedChargeCents = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.price_per_minute_cents) : 0;
  const likelyInsufficient = Number.isFinite(normalizedBalanceAmountCents) && estimatedChargeCents > 0 && normalizedBalanceAmountCents < estimatedChargeCents;
  const selectedLocalModelMeta = getLocalModelMeta(selectedBalancedModel);
  const stageItems = getStageItems(taskSnapshot);
  const progressPercent = getVisualProgress(phase, uploadPercent, taskSnapshot);
  const showProgress = loading || phase === "success" || phase === "error" || phase === "upload_paused" || Boolean(taskSnapshot);
  const canRetryWithoutUpload = Boolean(taskId);
  const hasLocalFile = Boolean(file);
  const localTranscribing = phase === "local_transcribing";
  const localModeBusy = Boolean(localBusyModelKey) || localTranscribing;

  function updateLocalModelState(modelKey, patch) {
    setLocalModelStateMap((prev) => ({
      ...prev,
      [modelKey]: {
        ...(prev[modelKey] || {}),
        ...(patch || {}),
      },
    }));
  }

  function rejectPendingLocalRequests(message) {
    const error = new Error(message || "本地 ASR Worker 不可用");
    for (const [, request] of localAsrPendingRequestsRef.current.entries()) {
      request.reject(error);
    }
    localAsrPendingRequestsRef.current.clear();
  }

  function createWorkerRequest(type, modelKey, payload = {}, transfer = []) {
    const modelMeta = getLocalModelMeta(modelKey);
    if (!localAsrWorkerRef.current || !modelMeta) {
      return Promise.reject(new Error("本地 ASR Worker 未初始化"));
    }
    localAsrRequestSequenceRef.current += 1;
    const requestId = buildWorkerRequestId(localAsrRequestSequenceRef.current);
    return new Promise((resolve, reject) => {
      localAsrPendingRequestsRef.current.set(requestId, { resolve, reject, type, modelKey });
      localAsrWorkerRef.current.postMessage(
        {
          type,
          requestId,
          modelId: modelMeta.workerModelId,
          preferredRuntime: "wasm",
          assetBaseUrl: LOCAL_ASR_ASSET_BASE_URL,
          ...payload,
        },
        transfer,
      );
    });
  }

  function clearUploadPersistTimer() {
    if (uploadPersistRef.current.timer) {
      clearTimeout(uploadPersistRef.current.timer);
      uploadPersistRef.current.timer = null;
    }
  }

  function resetUploadPersistState() {
    clearUploadPersistTimer();
    uploadPersistRef.current.lastSavedAt = 0;
    uploadPersistRef.current.lastSavedPercent = -1;
    uploadPersistRef.current.latestPercent = 0;
  }

  function stopPollingSession() {
    pollingAbortRef.current = true;
    pollTokenRef.current += 1;
  }

  function startPollingSession() {
    pollingAbortRef.current = false;
    pollTokenRef.current += 1;
    return pollTokenRef.current;
  }

  useEffect(() => {
    onTaskStateChange?.(buildTaskState({ phase, taskId, taskSnapshot, uploadPercent, status }));
  }, [onTaskStateChange, phase, taskId, taskSnapshot, uploadPercent, status]);

  useEffect(() => () => {
    stopPollingSession();
    clearUploadPersistTimer();
    uploadAbortRef.current?.abort();
    rejectPendingLocalRequests("本地 ASR Worker 已关闭");
    localAsrWorkerRef.current?.terminate?.();
  }, []);

  useEffect(() => {
    if (!localAsrSupport.supported) {
      const unsupportedMap = Object.fromEntries(
        LOCAL_MODEL_OPTIONS.map((item) => [
          item.key,
          {
            status: "unsupported",
            runtime: "",
            progress: null,
            error: localAsrSupport.reason,
          },
        ]),
      );
      setLocalModelStateMap(unsupportedMap);
      return undefined;
    }
    const worker = new Worker(new URL("./localAsrPreviewWorker.js", import.meta.url));
    localAsrWorkerRef.current = worker;

    const handleMessage = (event) => {
      const payload = event?.data || {};
      const requestId = String(payload?.requestId || "");
      const pending = requestId ? localAsrPendingRequestsRef.current.get(requestId) : null;
      const modelKey = pending?.modelKey || LOCAL_MODEL_OPTIONS.find((item) => item.workerModelId === String(payload?.modelId || payload?.model_id || ""))?.key || "";
      if (payload?.type === "progress" && modelKey) {
        if (payload.stage === "model-load-start") {
          updateLocalModelState(modelKey, { status: "loading", runtime: String(payload.runtime || ""), progress: null, error: "" });
          setLocalBusyModelKey(modelKey);
          setLocalBusyText(String(payload.status_text || "正在下载模型"));
          return;
        }
        if (payload.stage === "model-progress") {
          updateLocalModelState(modelKey, {
            status: "loading",
            runtime: String(payload.runtime || ""),
            progress: Number.isFinite(Number(payload.progress)) ? clampPercent(payload.progress) : null,
            error: "",
          });
          setLocalBusyModelKey(modelKey);
          setLocalBusyText(String(payload.status || "正在下载模型"));
          return;
        }
        if (payload.stage === "runtime-fallback") {
          updateLocalModelState(modelKey, { runtime: String(payload.runtime || "wasm") });
          setLocalBusyText(String(payload.status_text || "已回退到 WASM"));
          return;
        }
      }
      if (payload?.type === "result" && pending) {
        localAsrPendingRequestsRef.current.delete(requestId);
        pending.resolve(payload);
        return;
      }
      if (payload?.type === "error" && pending) {
        localAsrPendingRequestsRef.current.delete(requestId);
        pending.reject(new Error(String(payload.message || "本地 ASR Worker 失败")));
      }
    };

    const handleWorkerError = (event) => {
      const message = event?.message || "本地 ASR Worker 启动失败";
      rejectPendingLocalRequests(message);
      setLocalBusyModelKey("");
      setLocalBusyText("");
      setLocalModelStateMap((prev) => {
        const next = { ...prev };
        LOCAL_MODEL_OPTIONS.forEach((item) => {
          next[item.key] = {
            ...(next[item.key] || {}),
            status: "error",
            error: message,
          };
        });
        return next;
      });
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      rejectPendingLocalRequests("本地 ASR Worker 已关闭");
      worker.terminate();
      if (localAsrWorkerRef.current === worker) {
        localAsrWorkerRef.current = null;
      }
    };
  }, [localAsrSupport.reason, localAsrSupport.supported]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalModelVisualProgressMap((prev) => {
        let changed = false;
        const next = { ...prev };
        LOCAL_MODEL_OPTIONS.forEach((item) => {
          const modelState = localModelStateMap[item.key] || {};
          const status = String(modelState.status || "");
          const rawProgress = Number(modelState.progress);
          const shouldShowProgress =
            ["ready", "cached"].includes(status) || (status === "loading" && Number.isFinite(rawProgress));

          if (!shouldShowProgress) {
            if (Object.prototype.hasOwnProperty.call(next, item.key)) {
              delete next[item.key];
              changed = true;
            }
            return;
          }

          const target = ["ready", "cached"].includes(status) ? 100 : clampPercent(rawProgress);
          const current = Number.isFinite(Number(prev[item.key])) ? clampPercent(prev[item.key]) : 0;
          const nextValue =
            target >= 100
              ? 100
              : current >= target
                ? current
                : Math.min(target, current + Math.max(1, Math.ceil((target - current) * 0.22)));

          if (!Object.prototype.hasOwnProperty.call(next, item.key) || Math.abs(Number(next[item.key]) - nextValue) > 0.001) {
            next[item.key] = nextValue;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, LOCAL_MODEL_VISUAL_PROGRESS_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [localModelStateMap]);

  useEffect(() => {
    let canceled = false;
    async function restoreLocalModelState() {
      const cachedStates = await listLocalAsrPreviewStates().catch(() => []);
      if (canceled) return;
      const nextMap = Object.fromEntries(
        LOCAL_MODEL_OPTIONS.map((item) => {
          const cached = cachedStates.find((entry) => entry?.model_id === item.key);
          if (!localAsrSupport.supported) {
            return [item.key, { status: "unsupported", runtime: "", progress: null, error: localAsrSupport.reason }];
          }
          if (!cached) {
            return [item.key, { status: "idle", runtime: "", progress: null, error: "" }];
          }
          const cachedStatus = String(cached.status || "").trim();
          return [
            item.key,
            {
              status: cachedStatus === "ready" ? "cached" : cachedStatus || "idle",
              runtime: String(cached.runtime || ""),
              progress: cachedStatus === "ready" ? 100 : null,
              error: String(cached.last_error || ""),
            },
          ];
        }),
      );
      setLocalModelStateMap(nextMap);
    }
    void restoreLocalModelState();
    return () => {
      canceled = true;
    };
  }, [localAsrSupport.reason, localAsrSupport.supported]);

  function resetLocalSessionState(options = {}) {
    const { clearFileInput = true } = options;
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    if (clearFileInput && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
  }

  async function persistSession(overrides = {}) {
    const nextFile = overrides.file ?? file;
    const nextTaskId = overrides.taskId ?? taskId;
    const nextPhase = overrides.phase ?? phase;
    const nextMode = overrides.mode ?? mode;
    if (!ownerUserId) return;
    if (!nextFile && !nextTaskId && nextPhase === "idle") {
      await clearActiveGenerationTask(ownerUserId);
      return;
    }
    await saveActiveGenerationTask(ownerUserId, {
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
      generation_mode: nextMode === "fast" ? "fast" : "balanced",
      upload_percent: Number(overrides.uploadPercent ?? uploadPercent ?? 0),
      status_text: String(overrides.status ?? status ?? ""),
      semantic_split_enabled: false,
      binding_completed: Boolean(overrides.bindingCompleted ?? bindingCompleted),
    });
  }

  async function resetSession() {
    resetLocalSessionState();
    if (!ownerUserId) return;
    await clearActiveGenerationTask(ownerUserId);
  }

  function persistUploadProgress(nextPercent) {
    if (!ownerUserId || !file) return;
    const normalizedPercent = clampPercent(nextPercent);
    uploadPersistRef.current.latestPercent = normalizedPercent;
    const now = Date.now();
    const elapsed = now - Number(uploadPersistRef.current.lastSavedAt || 0);
    const shouldPersistImmediately =
      uploadPersistRef.current.lastSavedPercent < 0 ||
      normalizedPercent >= 100 ||
      elapsed >= UPLOAD_PROGRESS_PERSIST_INTERVAL_MS;

    clearUploadPersistTimer();

    const flush = () => {
      uploadPersistRef.current.lastSavedAt = Date.now();
      uploadPersistRef.current.lastSavedPercent = normalizedPercent;
      void persistSession({ phase: "uploading", uploadPercent: normalizedPercent, status: "" });
    };

    if (shouldPersistImmediately) {
      flush();
      return;
    }

    uploadPersistRef.current.timer = setTimeout(() => {
      uploadPersistRef.current.timer = null;
      flush();
    }, Math.max(80, UPLOAD_PROGRESS_PERSIST_INTERVAL_MS - elapsed));
  }

  async function pauseUpload(nextStatus = "上传已暂停，可继续上传当前素材") {
    stopPollingSession();
    clearUploadPersistTimer();
    const activeAbortController = uploadAbortRef.current;
    uploadAbortRef.current = null;
    activeAbortController?.abort();
    setTaskId("");
    setLoading(false);
    setStatus(nextStatus);
    setPhase("upload_paused");
    setTaskSnapshot(null);
    await persistSession({
      taskId: "",
      phase: "upload_paused",
      taskSnapshot: null,
      uploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
      status: nextStatus,
      bindingCompleted: false,
    });
  }

  async function clearTaskRuntime(nextStatus = "") {
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    setTaskId("");
    setLoading(false);
    setStatus(nextStatus);
    setPhase(file ? "ready" : "idle");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setBindingCompleted(false);
    await persistSession({
      taskId: "",
      phase: file ? "ready" : "idle",
      taskSnapshot: null,
      uploadPercent: 0,
      status: nextStatus,
      bindingCompleted: false,
    });
  }

  async function finalizeSuccess(data, sourceFile = file, silentToast = false) {
    resetUploadPersistState();
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
    if (ownerUserId) {
      await clearActiveGenerationTask(ownerUserId);
    }
    await onWalletChanged?.();
    if (data.lesson) await onCreated?.({ lesson: data.lesson, mediaPreview, mediaPersisted });
    if (!silentToast) (successMessage ? toast.warning(successMessage) : toast.success("课程已生成"));
  }

  async function pollTask(nextTaskId, silentToast = false, pollToken = pollTokenRef.current) {
    if (!nextTaskId || pollingAbortRef.current || pollToken !== pollTokenRef.current) return;
    try {
      const resp = await api(`/api/lessons/tasks/${nextTaskId}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (pollingAbortRef.current || pollToken !== pollTokenRef.current) return;
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
      resetUploadPersistState();
      await persistSession({ phase: "processing", taskSnapshot: data, uploadPercent: 100 });
      setTimeout(() => void pollTask(nextTaskId, silentToast, pollToken), 1000);
    } catch (error) {
      if (pollingAbortRef.current || pollToken !== pollTokenRef.current || error?.name === "AbortError") return;
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      await persistSession({ phase: "error", status: message });
      if (!silentToast) toast.error(message);
    }
  }

  useEffect(() => {
    let canceled = false;
    resetLocalSessionState();
    previousPanelActiveRef.current = Boolean(isActivePanel);

    async function restoreSession() {
      if (!ownerUserId) return;
      const saved = await getActiveGenerationTask(ownerUserId);
      if (!saved || canceled) return;

      const savedPhase = String(saved.phase || "").toLowerCase();
      const savedTaskStatus = String(saved.task_snapshot?.status || "").toLowerCase();
      if (savedPhase === "success" || savedTaskStatus === "succeeded") {
        await clearActiveGenerationTask(ownerUserId);
        return;
      }

      const restoredFile = createFileFromBlob(saved.file_blob, saved.file_name, saved.media_type);
      const restoredPhase = !saved.task_id && savedPhase === "uploading" ? "upload_paused" : savedPhase;
      const restoredStatus =
        !saved.task_id && savedPhase === "uploading"
          ? String(saved.status_text || "检测到上次上传中断，可继续上传当前素材")
          : String(saved.status_text || "");
      setFile(restoredFile);
      setTaskId(String(saved.task_id || ""));
      setStatus(restoredStatus);
      setDurationSec(Number(saved.duration_seconds || 0) || null);
      setPhase(restoredPhase || "idle");
      setMode(String(saved.generation_mode || "").toLowerCase() === "fast" ? "fast" : "balanced");
      setCoverDataUrl(String(saved.cover_data_url || ""));
      setCoverWidth(Number(saved.cover_width || 0));
      setCoverHeight(Number(saved.cover_height || 0));
      setCoverAspectRatio(Number(saved.aspect_ratio || 0));
      setIsVideoSource(Boolean(saved.is_video_source));
      setTaskSnapshot(saved.task_snapshot || null);
      setUploadPercent(Number(saved.upload_percent || 0));
      uploadPersistRef.current.latestPercent = Number(saved.upload_percent || 0);
      setBindingCompleted(Boolean(saved.binding_completed));
      setLoading(["processing"].includes(restoredPhase));
      if (saved.task_id && (["pending", "running"].includes(savedTaskStatus) || ["processing", "uploading"].includes(savedPhase))) {
        const pollToken = startPollingSession();
        void pollTask(String(saved.task_id), true, pollToken);
      }
    }

    void restoreSession();
    return () => {
      canceled = true;
    };
  }, [ownerUserId]);

  useEffect(() => {
    const wasActivePanel = previousPanelActiveRef.current;
    if (!wasActivePanel && isActivePanel && phase === "success") {
      resetLocalSessionState();
    }
    previousPanelActiveRef.current = Boolean(isActivePanel);
  }, [isActivePanel, ownerUserId, phase, taskId]);

  async function onSelectFile(nextFile) {
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    setFile(nextFile);
    setTaskId("");
    setLoading(false);
    setStatus("");
    setDurationSec(null);
    setTaskSnapshot(null);
    setCoverDataUrl("");
    setCoverAspectRatio(0);
    setCoverWidth(0);
    setCoverHeight(0);
    setIsVideoSource(false);
    setUploadPercent(0);
    uploadPersistRef.current.latestPercent = 0;
    setBindingCompleted(false);
    if (!nextFile) {
      setPhase("idle");
      if (ownerUserId) {
        await clearActiveGenerationTask(ownerUserId);
      }
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

  async function handleLocalModelDownload(modelKey) {
    if (!localAsrSupport.supported) {
      toast.error(localAsrSupport.reason || "当前浏览器不支持均衡模式");
      return;
    }
    setLocalBusyModelKey(modelKey);
    setLocalBusyText("正在检查并下载本地模型");
    updateLocalModelState(modelKey, { status: "loading", progress: null, error: "" });
    try {
      const result = await createWorkerRequest("load-model", modelKey);
      const runtime = String(result?.runtime || "");
      updateLocalModelState(modelKey, { status: "ready", runtime, progress: 100, error: "" });
      await saveLocalAsrPreviewState(modelKey, {
        status: "ready",
        runtime,
        browser_supported: true,
        webgpu_supported: Boolean(localAsrSupport.webgpuSupported),
        last_error: "",
        user_agent: String(navigator?.userAgent || ""),
      });
      setSelectedBalancedModel(modelKey);
      toast.success("本地模型已准备好");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateLocalModelState(modelKey, { status: "error", progress: null, error: message });
      await saveLocalAsrPreviewState(modelKey, {
        status: "error",
        runtime: "",
        browser_supported: true,
        webgpu_supported: Boolean(localAsrSupport.webgpuSupported),
        last_error: message,
        user_agent: String(navigator?.userAgent || ""),
      });
      toast.error(message);
    } finally {
      setLocalBusyModelKey("");
      setLocalBusyText("");
    }
  }

  async function handleLocalModelRemove(modelKey) {
    const modelMeta = getLocalModelMeta(modelKey);
    setLocalBusyModelKey(modelKey);
    setLocalBusyText("正在卸载本地模型");
    updateLocalModelState(modelKey, { status: "removing", error: "" });
    try {
      await createWorkerRequest("dispose-model", modelKey).catch(() => null);
      await clearLocalModelCaches(modelMeta);
      await deleteLocalAsrPreviewState(modelKey);
      updateLocalModelState(modelKey, { status: "idle", runtime: "", progress: null, error: "" });
      toast.success("本地模型已卸载");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateLocalModelState(modelKey, { status: "error", progress: null, error: message });
      toast.error(`卸载失败: ${message}`);
    } finally {
      setLocalBusyModelKey("");
      setLocalBusyText("");
    }
  }

  async function submitBalanced(pollToken) {
    if (!localAsrSupport.supported) {
      const message = localAsrSupport.reason || "当前浏览器不支持均衡模式";
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      return;
    }
    const modelState = localModelStateMap[selectedBalancedModel] || {};
    if (!["ready", "cached"].includes(String(modelState.status || ""))) {
      const message = "请先下载并就绪一个本地模型";
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      return;
    }
    setPhase("local_transcribing");
    setLoading(true);
    setStatus("正在本地识别字幕");
    await persistSession({ taskId: "", phase: "local_transcribing", taskSnapshot: null, uploadPercent: 0, status: "正在本地识别字幕", bindingCompleted: false });
    try {
      const audioData = await decodeFileForLocalAsr(file);
      if (!(audioData instanceof Float32Array) || audioData.length <= 0) {
        throw new Error("本地音频解析结果为空，无法继续生成");
      }
      const localResult = await createWorkerRequest(
        "transcribe-audio",
        selectedBalancedModel,
        {
          audioData,
          samplingRate: LOCAL_ASR_TARGET_SAMPLE_RATE,
          fileName: String(file?.name || ""),
        },
        [audioData.buffer],
      );
      if (!Array.isArray(localResult?.asr_payload?.transcripts?.[0]?.sentences) || localResult.asr_payload.transcripts[0].sentences.length === 0) {
        throw new Error("本地模型未识别出可用字幕，请切回高速模式或更换素材");
      }
      const resp = await api(
        "/api/lessons/tasks/local-asr",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asr_model: selectedBalancedModel,
            source_filename: String(file?.name || "local-source"),
            source_duration_ms: Math.max(1, Math.round(Number(durationSec || 0) * 1000)),
            asr_payload: localResult?.asr_payload || {},
          }),
        },
        accessToken,
      );
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "创建本地任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        await onWalletChanged?.();
        return;
      }
      const nextTaskId = String(data.task_id || "");
      setTaskId(nextTaskId);
      setTaskSnapshot(null);
      setPhase("processing");
      setLoading(true);
      setStatus("");
      await persistSession({ taskId: nextTaskId, phase: "processing", taskSnapshot: null, uploadPercent: 100, status: "", bindingCompleted: false });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
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
    stopPollingSession();
    resetUploadPersistState();
    const pollToken = startPollingSession();
    uploadAbortRef.current?.abort();
    setLoading(true);
    setTaskId("");
    setStatus("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    uploadPersistRef.current.latestPercent = 0;
    if (mode === "balanced") {
      await submitBalanced(pollToken);
      return;
    }
    setPhase("uploading");
    await persistSession({ taskId: "", phase: "uploading", taskSnapshot: null, uploadPercent: 0, status: "", bindingCompleted: false });
    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("asr_model", selectedAsrModel);
      form.append("semantic_split_enabled", "false");
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const { ok, data } = await uploadWithProgress(
        "/api/lessons/tasks",
        {
          method: "POST",
          body: form,
          signal: abortController.signal,
          onUploadProgress: ({ percent }) => {
            const nextPercent = clampPercent(percent);
            uploadPersistRef.current.latestPercent = nextPercent;
            setUploadPercent(nextPercent);
            persistUploadProgress(nextPercent);
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
      uploadPersistRef.current.latestPercent = 100;
      setPhase("processing");
      resetUploadPersistState();
      await persistSession({ taskId: nextTaskId, phase: "processing", uploadPercent: 100 });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      uploadAbortRef.current = null;
      if (error?.name === "AbortError") return;
      resetUploadPersistState();
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
    stopPollingSession();
    const pollToken = startPollingSession();
    setLoading(true);
    setStatus("");
    try {
      const resp = await api(`/api/lessons/tasks/${taskId}/resume`, { method: "POST" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const errorCode = String(data?.error_code || "");
        const baseMessage = toErrorText(data, "继续生成失败");
        const message = errorCode === "TASK_ARTIFACT_MISSING" ? `${baseMessage}；素材已过期，请更换素材或重新上传当前文件。` : baseMessage;
        const nextTaskSnapshot =
          errorCode === "TASK_ARTIFACT_MISSING" || errorCode === "TASK_RESUME_UNAVAILABLE"
            ? {
                ...(taskSnapshot || {}),
                status: "failed",
                error_code: errorCode,
                message: String(data?.message || message),
                current_text: String(data?.message || message),
                resume_available: false,
              }
            : taskSnapshot;
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        if (nextTaskSnapshot) {
          setTaskSnapshot(nextTaskSnapshot);
        }
        await persistSession({ phase: "error", status: message, taskSnapshot: nextTaskSnapshot });
        return;
      }
      setPhase("processing");
      setTaskSnapshot((prev) =>
        prev
          ? {
              ...prev,
              status: "pending",
              error_code: "",
              message: "",
              current_text: "准备重新生成",
              resume_available: false,
            }
          : prev,
      );
      await persistSession({ phase: "processing", uploadPercent: 100, status: "" });
      void pollTask(taskId, false, pollToken);
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
        <CardDescription>自动识别翻译，生成学习课程</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <p className="text-muted-foreground">当前余额：{formatMoneyCents(normalizedBalanceAmountCents)}</p>
            <p className="text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-2">预估扣费</span></TooltipTrigger>
                <TooltipContent>按素材秒数折算分钟后计费，金额统一按分存储、按元展示。</TooltipContent>
              </Tooltip>
              ：{selectedRate ? (durationSec != null ? `${formatMoneyCents(estimatedChargeCents)}（${formatMoneyPerMinute(selectedRate.price_per_minute_cents)}）` : "选择文件后显示") : "该模型未配置单价"}
            </p>
            <p className="text-muted-foreground">当前模式：{mode === "balanced" ? `均衡 · ${selectedLocalModelMeta.title}` : "高速"}</p>
            {likelyInsufficient ? <p className="mt-1 text-destructive">余额可能不足，提交将被拒绝。</p> : null}
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <p className="text-sm font-medium">生成模式</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={mode === "balanced" ? "default" : "outline"} className="h-9 px-4" onClick={() => setMode("balanced")} disabled={loading || localTranscribing}>
              均衡
            </Button>
            <Button type="button" variant={mode === "fast" ? "default" : "outline"} className="h-9 px-4" onClick={() => setMode("fast")} disabled={loading || localTranscribing}>
              高速
            </Button>
          </div>
          {mode === "balanced" && !localAsrSupport.supported ? <p className="text-xs text-destructive">{localAsrSupport.reason}</p> : null}
        </div>

        {mode === "balanced" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {LOCAL_MODEL_OPTIONS.slice(0, 1).map((item) => {
              const state = localModelStateMap[item.key] || { status: localAsrSupport.supported ? "idle" : "unsupported", runtime: "", progress: null, error: localAsrSupport.reason };
              const selected = selectedBalancedModel === item.key;
              const downloaded = ["ready", "cached"].includes(String(state.status || ""));
              const visualProgress = Number(localModelVisualProgressMap[item.key]);
              const showVisualProgress = Number.isFinite(visualProgress);
              return (
                <div
                  key={item.key}
                  className={cn(
                    "space-y-3 rounded-2xl border p-4 transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border bg-background/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <button type="button" className="text-left" onClick={() => setSelectedBalancedModel(item.key)} disabled={loading || localTranscribing}>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                      </button>
                    </div>
                    <Badge variant={downloaded ? "default" : "outline"}>{getLocalModelStatusLabel(state.status)}</Badge>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>预计下载：{formatLocalModelEstimate(item, localAsrSupport)}</p>
                    {showVisualProgress ? (
                      <div className="space-y-1">
                        <p>下载进度：{clampPercent(visualProgress)}%</p>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${clampPercent(visualProgress)}%` }} />
                        </div>
                      </div>
                    ) : null}
                    {state.error ? <p className="text-destructive">{state.error}</p> : null}
                    {localBusyModelKey === item.key && localBusyText ? <p>{localBusyText}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void handleLocalModelDownload(item.key)} disabled={!localAsrSupport.supported || loading || localTranscribing || localBusyModelKey === item.key}>
                      {String(state.status || "") === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
                      {downloaded ? "重新校验" : "下载模型"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelectedBalancedModel(item.key)} disabled={loading || localTranscribing}>
                      设为当前
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void handleLocalModelRemove(item.key)} disabled={!downloaded || loading || localTranscribing || localBusyModelKey === item.key}>
                      卸载
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

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
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-700">生成成功</p>
                <p className="text-sm text-emerald-700/80">
                  {status || "课程已写入历史记录，你可以回到历史记录定位新课程，或继续上传下一份素材。"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => onNavigateToLesson?.(taskSnapshot.lesson.id)}>
                去历史记录
              </Button>
              <Button type="button" variant="outline" onClick={() => void resetSession()}>
                继续上传
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "error" && status ? (
          <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{status}</p>
            <div className="flex flex-wrap gap-2">
              {canRetryWithoutUpload ? <Button type="button" onClick={() => void resumeTask()}><RefreshCcw className="size-4" />{taskSnapshot?.resume_available ? "免上传继续生成" : "免上传重新生成"}</Button> : null}
              {hasLocalFile ? <Button type="button" variant="secondary" onClick={() => void submit()}><RefreshCcw className="size-4" />重新上传当前素材</Button> : null}
              {hasLocalFile ? <Button type="button" variant="ghost" onClick={() => void clearTaskRuntime()}>保留素材并清空错误</Button> : null}
              <Button type="button" variant="outline" onClick={() => void resetSession()}>更换素材</Button>
            </div>
          </div>
        ) : null}

        {phase === "upload_paused" ? (
          <div className="space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
            <p className="text-sm text-muted-foreground">{status || "上传已暂停，可继续上传当前素材。"}</p>
            <div className="flex flex-wrap gap-2">
              {hasLocalFile ? <Button type="button" onClick={() => void submit()}><RefreshCcw className="size-4" />继续上传当前素材</Button> : null}
              {hasLocalFile ? <Button type="button" variant="ghost" onClick={() => void clearTaskRuntime()}>保留素材并清空状态</Button> : null}
              <Button type="button" variant="outline" onClick={() => void resetSession()}>更换素材</Button>
            </div>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="grid gap-2" data-guide-id="upload-select-file">
            <input id="asr-file" ref={fileInputRef} type="file" accept={mode === "balanced" ? LOCAL_ASR_FILE_ACCEPT : undefined} className="hidden" onChange={(event) => { void onSelectFile(event.target.files?.[0] ?? null); }} disabled={loading || localModeBusy} />
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                    fileInputRef.current.click();
                  }
                }}
                disabled={loading || localModeBusy}
              >
                选择文件
              </Button>
              <Button type="button" variant="secondary" className="h-11" onClick={() => setLinkDialogOpen(true)} disabled={loading || localModeBusy}>链接生成视频</Button>
            </div>
            {file ? <p className="text-xs text-muted-foreground">{file.name}</p> : null}
          </div>
          <Button type="submit" disabled={loading || phase === "success" || (mode === "balanced" && (!localAsrSupport.supported || localModeBusy))} className="h-11 w-full" data-guide-id="upload-submit">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {phase === "uploading" ? "上传中" : phase === "local_transcribing" ? "本地识别中" : "生成中"}
              </span>
            ) : phase === "success" ? (
              "已生成完成"
            ) : phase === "upload_paused" ? (
              "继续上传当前素材"
            ) : (
              mode === "balanced" ? "开始均衡生成" : "开始生成课程"
            )}
          </Button>
          {phase === "uploading" ? (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => void pauseUpload()}>
              取消上传
            </Button>
          ) : null}
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
