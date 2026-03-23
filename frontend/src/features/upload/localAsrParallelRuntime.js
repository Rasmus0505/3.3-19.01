import { getLocalAsrWorkerAssetPayload } from "../../shared/media/localAsrAssetManager";

const DEFAULT_MODEL_ID = "local-sensevoice-small";
const DEFAULT_ASSET_BASE_URL = "/api/local-asr-assets";
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_OVERLAP_MS = 800;
const MAX_AUTO_WORKERS_BASELINE = 4;
const MAX_AUTO_WORKERS_MID = 6;
const MAX_AUTO_WORKERS_HIGH = 8;
const MAX_SEGMENTS = 24;
const SHORT_AUDIO_SECONDS = 3 * 60;
const MEDIUM_AUDIO_SECONDS = 12 * 60;
const LONG_AUDIO_SECONDS = 20 * 60;
const TARGET_SEGMENT_MS_MEDIUM = 90 * 1000;
const TARGET_SEGMENT_MS_LONG = 75 * 1000;
const MIN_SEGMENT_MS = 30 * 1000;
const WORD_DEDUPE_TOLERANCE_MS = 40;
const MIN_WORD_GAP_FOR_OVERLAP_MS = 1000;
const OVERLAP_GAP_RATIO = 1.5;
const WORKER_WARMUP_BATCH_SIZE = 2;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createAbortError(message = "识别已取消") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function normalizeModelKey(modelKey) {
  return String(modelKey || "").trim() || DEFAULT_MODEL_ID;
}

function normalizeAssetBaseUrl(assetBaseUrl) {
  return String(assetBaseUrl || DEFAULT_ASSET_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_ASSET_BASE_URL;
}

function normalizeHardwareConcurrency(hardwareConcurrency) {
  const numeric = Number(hardwareConcurrency || 0);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.max(1, Math.floor(numeric));
  }
  if (typeof navigator !== "undefined") {
    const browserValue = Number(navigator.hardwareConcurrency || 0);
    if (Number.isFinite(browserValue) && browserValue > 0) {
      return Math.max(1, Math.floor(browserValue));
    }
  }
  return 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSurfaceText(text) {
  return String(text || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSurfacePunctuation(text) {
  return normalizeSurfaceText(text).replace(/^[\s.,!?;:"'`~()\[\]{}-]+|[\s.,!?;:"'`~()\[\]{}-]+$/g, "");
}

function composeText(parts) {
  return String(parts || "")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+'/g, "'")
    .replace(/'\s+/g, "'")
    .trim();
}

function toWordEntry(item) {
  const text = String(item?.text || item?.surface || "").trim();
  const surface = String(item?.surface || item?.text || "").trim();
  const beginMs = Math.max(0, Math.round(Number(item?.begin_ms ?? item?.begin_time ?? 0) || 0));
  const endMs = Math.max(beginMs + 1, Math.round(Number(item?.end_ms ?? item?.end_time ?? beginMs + 1) || beginMs + 1));
  if (!text && !surface) return null;
  return {
    text: text || stripSurfacePunctuation(surface) || surface,
    surface: surface || text,
    begin_ms: beginMs,
    end_ms: endMs,
  };
}

function toSentenceEntry(item, index = 0) {
  const text = String(item?.text || "").trim();
  const beginMs = Math.max(0, Math.round(Number(item?.begin_ms ?? item?.begin_time ?? 0) || 0));
  const endMs = Math.max(beginMs + 1, Math.round(Number(item?.end_ms ?? item?.end_time ?? beginMs + 1) || beginMs + 1));
  if (!text) return null;
  return {
    id: String(item?.id || `${index}-${beginMs}-${endMs}`),
    text,
    begin_ms: beginMs,
    end_ms: endMs,
  };
}

function buildSentenceEntries(words, fallbackSentences, totalDurationMs) {
  const sourceWords = Array.isArray(words) ? words.map(toWordEntry).filter(Boolean) : [];
  if (!sourceWords.length) {
    const normalizedFallback = (Array.isArray(fallbackSentences) ? fallbackSentences : [])
      .map((item, index) => toSentenceEntry(item, index))
      .filter(Boolean);
    if (normalizedFallback.length > 0) {
      return normalizedFallback;
    }
    return [];
  }

  const sentences = [];
  let currentWords = [];

  function flushSentence() {
    if (!currentWords.length) return;
    const beginMs = Math.max(0, Number(currentWords[0]?.begin_ms || 0));
    const endMs = Math.max(beginMs + 1, Number(currentWords[currentWords.length - 1]?.end_ms || beginMs + 1));
    const text = composeText(currentWords.map((item) => item.surface).join(" "));
    if (text) {
      sentences.push({
        id: `${sentences.length}-${beginMs}-${endMs}`,
        text,
        begin_ms: beginMs,
        end_ms: endMs,
      });
    }
    currentWords = [];
  }

  for (let index = 0; index < sourceWords.length; index += 1) {
    const current = sourceWords[index];
    const next = sourceWords[index + 1] || null;
    currentWords.push(current);
    const gapMs = next ? Math.max(0, Number(next.begin_ms || 0) - Number(current.end_ms || 0)) : 0;
    const endsWithBoundary = /[.!?;。！？；]$/u.test(String(current.surface || ""));
    const endsWithSoftBoundary = /[,，:：]$/u.test(String(current.surface || ""));
    const reachedWordSoftLimit = currentWords.length >= 18;
    const shouldSplit =
      !next ||
      endsWithBoundary ||
      gapMs >= 1200 ||
      (reachedWordSoftLimit && (endsWithSoftBoundary || gapMs >= 400 || currentWords.length >= 24));

    if (shouldSplit) {
      flushSentence();
    }
  }

  flushSentence();

  if (!sentences.length) {
    return [
      {
        id: `0-0-${Math.max(1, totalDurationMs)}`,
        text: composeText(sourceWords.map((item) => item.surface).join(" ")),
        begin_ms: 0,
        end_ms: Math.max(1, totalDurationMs),
      },
    ];
  }
  return sentences;
}

function buildAsrPayload(words, sentences, rawResult) {
  const safeWords = Array.isArray(words) ? words.map(toWordEntry).filter(Boolean) : [];
  const safeSentences = Array.isArray(sentences) ? sentences.map((item, index) => toSentenceEntry(item, index)).filter(Boolean) : [];
  const transcriptText = composeText(
    (safeSentences.length > 0 ? safeSentences : safeWords).map((item) => item.text || item.surface).join(" "),
  );
  return {
    source: "local_browser_asr",
    engine: "sherpa_onnx_sensevoice",
    transcripts: [
      {
        text: transcriptText,
        lang: String(rawResult?.lang || ""),
        emotion: String(rawResult?.emotion || ""),
        event: String(rawResult?.event || ""),
        words: safeWords.map((item) => ({
          text: String(item.text || item.surface || "").trim(),
          surface: String(item.surface || item.text || "").trim(),
          begin_time: Math.max(0, Number(item.begin_ms || 0)),
          end_time: Math.max(0, Number(item.end_ms || 0)),
        })),
        sentences: safeSentences.map((item) => ({
          text: String(item.text || "").trim(),
          begin_time: Math.max(0, Number(item.begin_ms || 0)),
          end_time: Math.max(0, Number(item.end_ms || 0)),
        })),
      },
    ],
  };
}

function shiftWordToGlobal(word, offsetMs) {
  const normalized = toWordEntry(word);
  if (!normalized) return null;
  return {
    ...normalized,
    begin_ms: normalized.begin_ms + offsetMs,
    end_ms: normalized.end_ms + offsetMs,
  };
}

function shiftSentenceToGlobal(sentence, offsetMs, index = 0) {
  const normalized = toSentenceEntry(sentence, index);
  if (!normalized) return null;
  const beginMs = normalized.begin_ms + offsetMs;
  const endMs = normalized.end_ms + offsetMs;
  return {
    ...normalized,
    id: `${normalized.id}-${offsetMs}`,
    begin_ms: beginMs,
    end_ms: Math.max(beginMs + 1, endMs),
  };
}

function isMidpointInsideKeepRange(beginMs, endMs, keepStartMs, keepEndMs, isLastSegment = false) {
  const midpoint = beginMs + (endMs - beginMs) / 2;
  if (isLastSegment) {
    return midpoint >= keepStartMs && midpoint <= keepEndMs;
  }
  return midpoint >= keepStartMs && midpoint < keepEndMs;
}

function dedupeSortedWords(words) {
  const output = [];
  for (const item of words) {
    if (!item) continue;
    const previous = output[output.length - 1] || null;
    if (!previous) {
      output.push(item);
      continue;
    }
    const sameSurface = normalizeSurfaceText(previous.surface) === normalizeSurfaceText(item.surface);
    const sameText = normalizeSurfaceText(previous.text) === normalizeSurfaceText(item.text);
    const nearlySameBegin = Math.abs(previous.begin_ms - item.begin_ms) <= WORD_DEDUPE_TOLERANCE_MS;
    const nearlySameEnd = Math.abs(previous.end_ms - item.end_ms) <= WORD_DEDUPE_TOLERANCE_MS;
    if ((sameSurface || sameText) && nearlySameBegin && nearlySameEnd) {
      continue;
    }
    if (item.begin_ms < previous.end_ms && (sameSurface || sameText)) {
      continue;
    }
    output.push(item);
  }
  return output;
}

function createSegmentAudioData(audioData, samplingRate, startMs, endMs) {
  const startIndex = Math.max(0, Math.floor((startMs / 1000) * samplingRate));
  const endIndex = Math.min(audioData.length, Math.ceil((endMs / 1000) * samplingRate));
  if (endIndex <= startIndex) {
    return new Float32Array(0);
  }
  return audioData.slice(startIndex, endIndex);
}

function chooseTargetSegmentMs(durationSec) {
  if (durationSec > LONG_AUDIO_SECONDS) {
    return TARGET_SEGMENT_MS_LONG;
  }
  return TARGET_SEGMENT_MS_MEDIUM;
}

function computeMaxAutoWorkers(hardwareConcurrency) {
  const safeHardware = normalizeHardwareConcurrency(hardwareConcurrency);
  if (safeHardware >= 12) {
    return MAX_AUTO_WORKERS_HIGH;
  }
  if (safeHardware >= 8) {
    return MAX_AUTO_WORKERS_MID;
  }
  return MAX_AUTO_WORKERS_BASELINE;
}

export function computeLocalAsrConcurrency({ durationSec = 0, hardwareConcurrency } = {}) {
  const safeDurationSec = Math.max(0, Number(durationSec || 0));
  const safeHardware = normalizeHardwareConcurrency(hardwareConcurrency);
  const maxAutoWorkers = computeMaxAutoWorkers(safeHardware);
  if (safeDurationSec <= SHORT_AUDIO_SECONDS) {
    return 1;
  }
  if (safeDurationSec <= MEDIUM_AUDIO_SECONDS) {
    return clamp(Math.floor(safeHardware / 4) || 1, 1, 2);
  }
  if (safeDurationSec <= LONG_AUDIO_SECONDS) {
    return clamp(Math.floor(safeHardware / 3) || 2, 2, Math.min(maxAutoWorkers, MAX_AUTO_WORKERS_BASELINE));
  }
  return clamp(Math.floor(safeHardware / 2) || 2, 2, maxAutoWorkers);
}

export function shouldUseParallelLocalAsr({ durationSec = 0, hardwareConcurrency } = {}) {
  return computeLocalAsrConcurrency({ durationSec, hardwareConcurrency }) > 1;
}

function computeTargetSegmentCount(totalDurationMs, plannedConcurrency, targetSegmentMs, effectiveDurationSec) {
  const durationDrivenCount = Math.ceil(totalDurationMs / Math.max(MIN_SEGMENT_MS, targetSegmentMs));
  const concurrencyMultiplier = effectiveDurationSec > LONG_AUDIO_SECONDS ? 3 : 2;
  return clamp(
    Math.max(plannedConcurrency, durationDrivenCount, plannedConcurrency * concurrencyMultiplier),
    plannedConcurrency,
    MAX_SEGMENTS,
  );
}

export function buildLocalAsrSegmentPlan({
  audioData,
  samplingRate = DEFAULT_SAMPLE_RATE,
  durationSec = 0,
  hardwareConcurrency,
  overlapMs = DEFAULT_OVERLAP_MS,
} = {}) {
  if (!(audioData instanceof Float32Array) || audioData.length <= 0) {
    throw new Error("音频数据无效，无法生成并行切段方案");
  }
  const safeSamplingRate = Math.max(1, Number(samplingRate || DEFAULT_SAMPLE_RATE));
  const totalDurationMs = Math.max(1, Math.round((audioData.length / safeSamplingRate) * 1000));
  const effectiveDurationSec = Math.max(Number(durationSec || 0), totalDurationMs / 1000);
  const plannedConcurrency = computeLocalAsrConcurrency({
    durationSec: effectiveDurationSec,
    hardwareConcurrency,
  });
  const safeOverlapMs = Math.max(0, Math.round(overlapMs || 0));
  const targetSegmentMs = Math.max(MIN_SEGMENT_MS, chooseTargetSegmentMs(effectiveDurationSec));
  if (plannedConcurrency <= 1 || totalDurationMs <= SHORT_AUDIO_SECONDS * 1000) {
    return {
      plannedConcurrency,
      actualConcurrency: 1,
      overlapMs: safeOverlapMs,
      segmentCount: 1,
      totalDurationMs,
      segments: [
        {
          index: 0,
          keep_start_ms: 0,
          keep_end_ms: totalDurationMs,
          actual_start_ms: 0,
          actual_end_ms: totalDurationMs,
          audioData: new Float32Array(audioData),
        },
      ],
    };
  }

  const segmentCount = computeTargetSegmentCount(totalDurationMs, plannedConcurrency, targetSegmentMs, effectiveDurationSec);
  const rawSegmentMs = Math.max(MIN_SEGMENT_MS, Math.ceil(totalDurationMs / segmentCount));
  const segments = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const keepStartMs = index * rawSegmentMs;
    const keepEndMs = index === segmentCount - 1 ? totalDurationMs : Math.min(totalDurationMs, (index + 1) * rawSegmentMs);
    if (keepEndMs <= keepStartMs) {
      continue;
    }
    const actualStartMs = Math.max(0, keepStartMs - safeOverlapMs);
    const actualEndMs = Math.min(totalDurationMs, keepEndMs + safeOverlapMs);
    const segmentAudioData = createSegmentAudioData(audioData, safeSamplingRate, actualStartMs, actualEndMs);
    segments.push({
      index,
      keep_start_ms: keepStartMs,
      keep_end_ms: keepEndMs,
      actual_start_ms: actualStartMs,
      actual_end_ms: actualEndMs,
      audioData: segmentAudioData,
    });
  }

  const actualConcurrency = Math.min(plannedConcurrency, Math.max(1, segments.length));
  return {
    plannedConcurrency,
    actualConcurrency,
    overlapMs: safeOverlapMs,
    segmentCount: segments.length,
    totalDurationMs,
    segments,
  };
}

function buildRequestId(prefix, sequence) {
  return `${prefix}-${Date.now()}-${sequence}`;
}

function createLocalAsrWorkerClient({ modelKey, assetBaseUrl, workerAssetPayload, onWorkerProgress }) {
  const worker = new Worker(new URL("./localAsrPreviewWorker.js", import.meta.url));
  const pendingRequests = new Map();
  let requestSequence = 0;
  let terminated = false;

  function rejectPending(message, errorName = "Error") {
    const error = errorName === "AbortError" ? createAbortError(message) : new Error(message || "识别组件失败");
    for (const request of pendingRequests.values()) {
      request.reject(error);
    }
    pendingRequests.clear();
  }

  function terminate(message = "识别组件已关闭", errorName = "AbortError") {
    if (terminated) return;
    terminated = true;
    rejectPending(message, errorName);
    worker.terminate();
  }

  function handleMessage(event) {
    const payload = event?.data || {};
    const requestId = String(payload?.requestId || "");
    if (payload?.type === "progress") {
      onWorkerProgress?.(payload);
      return;
    }
    const pending = requestId ? pendingRequests.get(requestId) : null;
    if (!pending) {
      return;
    }
    if (payload?.type === "result") {
      pendingRequests.delete(requestId);
      pending.resolve(payload);
      return;
    }
    if (payload?.type === "error") {
      pendingRequests.delete(requestId);
      pending.reject(new Error(String(payload?.message || "识别组件失败")));
    }
  }

  function handleError(event) {
    const message = String(event?.message || "识别组件启动失败");
    terminate(message, "Error");
  }

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleError);

  async function request(type, payload = {}, transfer = []) {
    if (terminated) {
      throw createAbortError("识别组件已关闭");
    }
    requestSequence += 1;
    const requestId = buildRequestId(type, requestSequence);
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
      worker.postMessage(
        {
          type,
          requestId,
          modelId: normalizeModelKey(modelKey),
          preferredRuntime: "wasm",
          assetBaseUrl: normalizeAssetBaseUrl(assetBaseUrl),
          ...(workerAssetPayload || {}),
          ...(payload || {}),
        },
        transfer,
      );
    });
  }

  return {
    request,
    terminate,
  };
}

function createProgressCounters(completedSegments, totalSegments) {
  const safeDone = Math.max(0, Math.min(totalSegments, Number(completedSegments || 0)));
  const safeTotal = Math.max(safeDone, Number(totalSegments || 0));
  return {
    asr_done: safeDone,
    asr_estimated: safeTotal,
    translate_done: 0,
    translate_total: 0,
    segment_done: safeDone,
    segment_total: safeTotal,
  };
}

function createParallelProgressEvent({
  stage = "model-progress",
  currentText = "",
  completedSegments = 0,
  totalSegments = 0,
  plannedConcurrency = 1,
  activeConcurrency = 1,
  loadProgress = null,
} = {}) {
  return {
    stage,
    currentText: String(currentText || ""),
    completedSegments: Math.max(0, Number(completedSegments || 0)),
    totalSegments: Math.max(0, Number(totalSegments || 0)),
    plannedConcurrency: Math.max(1, Number(plannedConcurrency || 1)),
    activeConcurrency: Math.max(1, Number(activeConcurrency || 1)),
    loadProgress: Number.isFinite(Number(loadProgress)) ? clamp(Number(loadProgress), 0, 100) : null,
    counters: createProgressCounters(completedSegments, totalSegments),
  };
}

function computeAdaptiveBoundaryMs(boundaryMs, shiftedWords, actualStartMs, actualEndMs, overlapAllowanceMs) {
  if (!Array.isArray(shiftedWords) || shiftedWords.length < 2 || overlapAllowanceMs <= 0) {
    return boundaryMs;
  }
  let leftWord = null;
  let rightWord = null;
  for (const word of shiftedWords) {
    if (!word) continue;
    if (Number(word.end_ms || 0) <= boundaryMs) {
      leftWord = word;
      continue;
    }
    if (Number(word.begin_ms || 0) >= boundaryMs) {
      rightWord = word;
      break;
    }
  }
  if (!leftWord || !rightWord) {
    return boundaryMs;
  }
  const gapMs = Math.max(0, Number(rightWord.begin_ms || 0) - Number(leftWord.end_ms || 0));
  if (gapMs <= 0 || gapMs >= MIN_WORD_GAP_FOR_OVERLAP_MS) {
    return boundaryMs;
  }
  const midpoint = Number(leftWord.end_ms || 0) + gapMs / 2;
  const maxShift = Math.min(overlapAllowanceMs, gapMs * OVERLAP_GAP_RATIO);
  return clamp(midpoint, Math.max(actualStartMs, boundaryMs - maxShift), Math.min(actualEndMs, boundaryMs + maxShift));
}

function computeEffectiveKeepRange(segment, shiftedWords, isLastSegment) {
  const keepStartMs = Math.max(0, Number(segment?.keep_start_ms || 0));
  const keepEndMs = Math.max(keepStartMs + 1, Number(segment?.keep_end_ms || keepStartMs + 1));
  const actualStartMs = Math.max(0, Number(segment?.actual_start_ms || 0));
  const actualEndMs = Math.max(keepEndMs, Number(segment?.actual_end_ms || keepEndMs));
  const adaptiveKeepStartMs = computeAdaptiveBoundaryMs(keepStartMs, shiftedWords, actualStartMs, actualEndMs, keepStartMs - actualStartMs);
  const adaptiveKeepEndMs = isLastSegment
    ? keepEndMs
    : computeAdaptiveBoundaryMs(keepEndMs, shiftedWords, actualStartMs, actualEndMs, actualEndMs - keepEndMs);
  return {
    keepStartMs: adaptiveKeepStartMs,
    keepEndMs: Math.max(adaptiveKeepStartMs + 1, adaptiveKeepEndMs),
  };
}

function mergeParallelSegmentResults(results, totalDurationMs) {
  const shiftedWords = [];
  const shiftedSentences = [];
  for (const item of results) {
    const transcript = item?.result?.asr_payload?.transcripts?.[0] || {};
    const sourceWords = Array.isArray(transcript.words) ? transcript.words : [];
    const sourceSentences = Array.isArray(transcript.sentences) ? transcript.sentences : Array.isArray(item?.result?.segments) ? item.result.segments : [];
    const actualStartMs = Math.max(0, Number(item?.segment?.actual_start_ms || 0));
    const isLastSegment = Boolean(item?.isLastSegment);
    const shiftedSegmentWords = sourceWords.map((word) => shiftWordToGlobal(word, actualStartMs)).filter(Boolean);
    const effectiveKeepRange = computeEffectiveKeepRange(item?.segment, shiftedSegmentWords, isLastSegment);

    for (const shifted of shiftedSegmentWords) {
      if (!isMidpointInsideKeepRange(shifted.begin_ms, shifted.end_ms, effectiveKeepRange.keepStartMs, effectiveKeepRange.keepEndMs, isLastSegment)) {
        continue;
      }
      shiftedWords.push(shifted);
    }

    if (!sourceWords.length) {
      for (let index = 0; index < sourceSentences.length; index += 1) {
        const shifted = shiftSentenceToGlobal(sourceSentences[index], actualStartMs, index);
        if (!shifted) continue;
        if (
          !isMidpointInsideKeepRange(
            shifted.begin_ms,
            shifted.end_ms,
            effectiveKeepRange.keepStartMs,
            effectiveKeepRange.keepEndMs,
            isLastSegment,
          )
        ) {
          continue;
        }
        shiftedSentences.push(shifted);
      }
    }
  }

  shiftedWords.sort((left, right) => {
    if (left.begin_ms !== right.begin_ms) return left.begin_ms - right.begin_ms;
    return left.end_ms - right.end_ms;
  });
  const mergedWords = dedupeSortedWords(shiftedWords);
  const mergedSentences = buildSentenceEntries(mergedWords, shiftedSentences, totalDurationMs);
  const previewText = composeText(mergedSentences.map((item) => item.text).join(" "));
  const rawResult = results.find((item) => item?.result?.raw_result)?.result?.raw_result || {};
  return {
    words: mergedWords,
    sentences: mergedSentences,
    previewText,
    asrPayload: buildAsrPayload(mergedWords, mergedSentences, rawResult),
  };
}

function buildModelLoadingText(actualConcurrency, aggregateLoad) {
  if (actualConcurrency > 1) {
    return aggregateLoad == null ? "正在准备并行识别" : `正在加载并行识别模型 ${Math.round(aggregateLoad)}%`;
  }
  return aggregateLoad == null ? "正在准备识别字幕" : `正在加载本地模型 ${Math.round(aggregateLoad)}%`;
}

async function warmupWorkerPool(pool, actualConcurrency) {
  if (!Array.isArray(pool) || pool.length === 0) {
    return;
  }
  if (pool.length <= WORKER_WARMUP_BATCH_SIZE || actualConcurrency <= MAX_AUTO_WORKERS_BASELINE) {
    await Promise.all(pool.map((workerClient) => workerClient.request("load-model")));
    return;
  }
  for (let index = 0; index < pool.length; index += WORKER_WARMUP_BATCH_SIZE) {
    const batch = pool.slice(index, index + WORKER_WARMUP_BATCH_SIZE);
    await Promise.all(batch.map((workerClient) => workerClient.request("load-model")));
  }
}

export async function runLocalAsrWithAutoParallelism({
  modelKey = DEFAULT_MODEL_ID,
  audioData,
  samplingRate = DEFAULT_SAMPLE_RATE,
  durationSec = 0,
  assetBaseUrl = DEFAULT_ASSET_BASE_URL,
  hardwareConcurrency,
  signal,
  onProgress,
} = {}) {
  const safeModelKey = normalizeModelKey(modelKey);
  const safeAssetBaseUrl = normalizeAssetBaseUrl(assetBaseUrl);
  const totalStart = nowMs();

  if (!(audioData instanceof Float32Array) || audioData.length <= 0) {
    throw new Error("音频数据无效，无法执行本地识别");
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const workerAssetPayload = await getLocalAsrWorkerAssetPayload(safeModelKey, safeAssetBaseUrl);
  const plan = buildLocalAsrSegmentPlan({
    audioData,
    samplingRate,
    durationSec,
    hardwareConcurrency,
    overlapMs: DEFAULT_OVERLAP_MS,
  });

  const pool = [];
  const workerLoadProgress = new Map();
  let aborted = false;
  const abortHandler = () => {
    aborted = true;
    for (const workerClient of pool) {
      workerClient.terminate("识别已取消", "AbortError");
    }
  };
  signal?.addEventListener?.("abort", abortHandler, { once: true });

  try {
    onProgress?.(
      createParallelProgressEvent({
        currentText: plan.actualConcurrency > 1 ? "自动提速中，正在准备并行识别" : "正在准备识别字幕",
        completedSegments: 0,
        totalSegments: plan.segmentCount,
        plannedConcurrency: plan.plannedConcurrency,
        activeConcurrency: plan.actualConcurrency,
        loadProgress: 0,
      }),
    );

    for (let index = 0; index < plan.actualConcurrency; index += 1) {
      const workerClient = createLocalAsrWorkerClient({
        modelKey: safeModelKey,
        assetBaseUrl: safeAssetBaseUrl,
        workerAssetPayload,
        onWorkerProgress: (payload) => {
          if (payload?.stage === "model-progress") {
            workerLoadProgress.set(index, Number(payload?.progress || 0));
          }
          if (payload?.stage === "model-ready") {
            workerLoadProgress.set(index, 100);
          }
          const values = [...workerLoadProgress.values()];
          const aggregateLoad = values.length > 0 ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
          const progressStage = payload?.stage === "transcribe-start" ? "transcribe-start" : "model-progress";
          onProgress?.(
            createParallelProgressEvent({
              currentText: plan.actualConcurrency > 1 ? "自动提速中，正在准备并行识别" : "正在准备识别字幕",
              completedSegments: 0,
              totalSegments: plan.segmentCount,
              plannedConcurrency: plan.plannedConcurrency,
              activeConcurrency: plan.actualConcurrency,
              loadProgress: aggregateLoad,
            }),
          );
          onProgress?.(
            createParallelProgressEvent({
              stage: progressStage,
              currentText:
                progressStage === "transcribe-start"
                  ? plan.actualConcurrency > 1
                    ? "并行模型已就绪，开始识别"
                    : "本地模型已就绪，开始识别"
                  : buildModelLoadingText(plan.actualConcurrency, aggregateLoad),
              completedSegments: 0,
              totalSegments: plan.segmentCount,
              plannedConcurrency: plan.plannedConcurrency,
              activeConcurrency: plan.actualConcurrency,
              loadProgress: aggregateLoad,
            }),
          );
        },
      });
      pool.push(workerClient);
    }

    await warmupWorkerPool(pool, plan.actualConcurrency);
    if (aborted || signal?.aborted) {
      throw createAbortError();
    }

    const pendingSegments = [...plan.segments];
    const completed = [];
    let completedSegments = 0;

    async function runWorkerLoop(workerClient) {
      while (pendingSegments.length > 0) {
        if (aborted || signal?.aborted) {
          throw createAbortError();
        }
        const segment = pendingSegments.shift();
        if (!segment) {
          return;
        }
        const requestStart = nowMs();
        const segmentAudioData = segment.audioData;
        let result;
        try {
          result = await workerClient.request(
            "transcribe-audio",
            {
              audioData: segmentAudioData,
              samplingRate,
              fileName: `segment_${String(segment.index).padStart(4, "0")}.wav`,
            },
            [segmentAudioData.buffer],
          );
        } catch (error) {
          for (const otherWorker of pool) {
            if (otherWorker !== workerClient) {
              otherWorker.terminate("识别失败", "Error");
            }
          }
          throw new Error(`第 ${segment.index + 1}/${plan.segmentCount} 段识别失败：${error instanceof Error ? error.message : String(error)}`);
        }
        segment.audioData = null;
        completed.push({
          segment,
          result,
          elapsedMs: Math.max(0, Math.round(nowMs() - requestStart)),
          isLastSegment: segment.index === plan.segmentCount - 1,
        });
        completedSegments += 1;
        onProgress?.(
          createParallelProgressEvent({
            currentText:
              plan.actualConcurrency > 1
                ? `自动提速中，正在并行识别 ${completedSegments}/${plan.segmentCount}`
                : `正在识别字幕 ${completedSegments}/${plan.segmentCount}`,
            completedSegments,
            totalSegments: plan.segmentCount,
            plannedConcurrency: plan.plannedConcurrency,
            activeConcurrency: plan.actualConcurrency,
            loadProgress: 100,
          }),
        );
        onProgress?.(
          createParallelProgressEvent({
            stage: "segment-complete",
            currentText: `第 ${completedSegments}/${plan.segmentCount} 段已完成，耗时 ${Math.max(0, Math.round(nowMs() - requestStart))} ms`,
            completedSegments,
            totalSegments: plan.segmentCount,
            plannedConcurrency: plan.plannedConcurrency,
            activeConcurrency: plan.actualConcurrency,
            loadProgress: 100,
          }),
        );
      }
    }

    try {
      await Promise.all(pool.map((workerClient) => runWorkerLoop(workerClient)));
    } catch (error) {
      aborted = true;
      for (const workerClient of pool) {
        workerClient.terminate(error instanceof Error ? error.message : "parallel_asr_failed", "Error");
      }
      throw error;
    }
    if (aborted || signal?.aborted) {
      throw createAbortError();
    }

    completed.sort((left, right) => Number(left?.segment?.index || 0) - Number(right?.segment?.index || 0));
    const merged = mergeParallelSegmentResults(completed, plan.totalDurationMs);
    return {
      mode: plan.actualConcurrency > 1 ? "parallel" : "single",
      plannedConcurrency: plan.plannedConcurrency,
      actualConcurrency: plan.actualConcurrency,
      overlapMs: plan.overlapMs,
      segmentCount: plan.segmentCount,
      preview_text: merged.previewText,
      segments: merged.sentences,
      asr_payload: merged.asrPayload,
      raw_result: {
        mode: "parallel_browser",
        planned_concurrency: plan.plannedConcurrency,
        actual_concurrency: plan.actualConcurrency,
        overlap_ms: plan.overlapMs,
        segment_count: plan.segmentCount,
        total_duration_ms: plan.totalDurationMs,
        total_parallel_asr_ms: Math.max(0, Math.round(nowMs() - totalStart)),
        segments: completed.map((item) => ({
          segment_index: Number(item?.segment?.index || 0),
          keep_start_ms: Number(item?.segment?.keep_start_ms || 0),
          keep_end_ms: Number(item?.segment?.keep_end_ms || 0),
          actual_start_ms: Number(item?.segment?.actual_start_ms || 0),
          actual_end_ms: Number(item?.segment?.actual_end_ms || 0),
          worker_elapsed_ms: Number(item?.elapsedMs || 0),
          preview_text: String(item?.result?.preview_text || ""),
        })),
      },
    };
  } finally {
    signal?.removeEventListener?.("abort", abortHandler);
    for (const workerClient of pool) {
      workerClient.terminate("识别结束", "AbortError");
    }
  }
}
