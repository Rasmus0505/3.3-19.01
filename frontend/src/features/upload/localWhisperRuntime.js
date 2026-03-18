import { getLocalWhisperWorkerConfig } from "../../shared/media/localWhisperModelManager";

let whisperPipelinePromise = null;
let whisperPipeline = null;
let activeModelKey = "";
let activeModelPath = "";
let activeCacheName = "";

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
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
  return String(parts || [])
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+'/g, "'")
    .replace(/'\s+/g, "'")
    .trim();
}

function splitTextIntoSurfaceWords(text) {
  return String(text || "")
    .split(/\s+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function approximateWordsFromText(text, totalDurationMs) {
  const surfaces = splitTextIntoSurfaceWords(text);
  if (!surfaces.length) return [];
  const totalWeight = surfaces.reduce((sum, surface) => sum + Math.max(stripSurfacePunctuation(surface).length, 1), 0);
  let cursor = 0;
  return surfaces.map((surface, index) => {
    const weight = Math.max(stripSurfacePunctuation(surface).length, 1);
    const beginMs = cursor;
    const isLast = index === surfaces.length - 1;
    const endMs = isLast ? totalDurationMs : Math.max(beginMs + 1, cursor + Math.round((weight / Math.max(totalWeight, 1)) * totalDurationMs));
    cursor = endMs;
    return {
      text: stripSurfacePunctuation(surface) || surface,
      surface,
      begin_ms: beginMs,
      end_ms: endMs,
    };
  });
}

function buildWordItems(result, samplingRate, sampleCount) {
  const totalDurationMs = Math.max(1, Math.round((Math.max(0, Number(sampleCount || 0)) / Math.max(1, Number(samplingRate || 16000))) * 1000));
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const words = [];
  for (const chunk of chunks) {
    const text = normalizeSurfaceText(chunk?.text);
    if (!text) continue;
    const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
    const beginSec = Number(timestamp?.[0]);
    const endSec = Number(timestamp?.[1]);
    if (!Number.isFinite(beginSec) || !Number.isFinite(endSec) || endSec <= beginSec) {
      words.push(...approximateWordsFromText(text, totalDurationMs));
      continue;
    }
    words.push({
      text: stripSurfacePunctuation(text) || text,
      surface: text,
      begin_ms: Math.max(0, Math.round(beginSec * 1000)),
      end_ms: Math.max(1, Math.round(endSec * 1000)),
    });
  }
  return words.length ? words : approximateWordsFromText(result?.text, totalDurationMs);
}

function buildSentenceEntries(words, fallbackText, totalDurationMs) {
  const sourceWords = Array.isArray(words) ? words : [];
  if (!sourceWords.length) {
    const text = normalizeSurfaceText(fallbackText);
    if (!text) return [];
    return [{ id: `0-0-${totalDurationMs}`, text, begin_ms: 0, end_ms: Math.max(1, totalDurationMs) }];
  }
  const sentences = [];
  let currentWords = [];
  function flushSentence() {
    if (!currentWords.length) return;
    const beginMs = Math.max(0, Number(currentWords[0]?.begin_ms || 0));
    const endMs = Math.max(beginMs + 1, Number(currentWords[currentWords.length - 1]?.end_ms || beginMs + 1));
    const text = composeText(currentWords.map((item) => item.surface).join(" "));
    if (text) {
      sentences.push({ id: `${sentences.length}-${beginMs}-${endMs}`, text, begin_ms: beginMs, end_ms: endMs });
    }
    currentWords = [];
  }
  for (let index = 0; index < sourceWords.length; index += 1) {
    const current = sourceWords[index];
    const next = sourceWords[index + 1] || null;
    currentWords.push(current);
    const gapMs = next ? Math.max(0, Number(next.begin_ms || 0) - Number(current.end_ms || 0)) : 0;
    const endsWithBoundary = /[.!?;。！？；]$/u.test(String(current.surface || ""));
    const endsWithSoftBoundary = /[,，、]$/u.test(String(current.surface || ""));
    const reachedSoftLimit = currentWords.length >= 18;
    const shouldSplit = !next || endsWithBoundary || gapMs >= 1200 || (reachedSoftLimit && (endsWithSoftBoundary || gapMs >= 400 || currentWords.length >= 24));
    if (shouldSplit) flushSentence();
  }
  flushSentence();
  return sentences.length
    ? sentences
    : [{ id: `0-0-${totalDurationMs}`, text: composeText(sourceWords.map((item) => item.surface).join(" ")), begin_ms: 0, end_ms: Math.max(1, totalDurationMs) }];
}

function buildCustomCache(cacheName) {
  return {
    async match(request) {
      const cache = await caches.open(cacheName);
      return cache.match(request);
    },
    async put(request, response) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone ? response.clone() : response);
    },
  };
}

export async function disposeLocalWhisperPipeline() {
  if (whisperPipeline && typeof whisperPipeline.dispose === "function") {
    await whisperPipeline.dispose();
  }
  whisperPipeline = null;
  whisperPipelinePromise = null;
  activeModelKey = "";
  activeModelPath = "";
  activeCacheName = "";
}

export async function ensureLocalWhisperPipeline(modelKey, { onProgress } = {}) {
  const { modelPath, cacheName } = await getLocalWhisperWorkerConfig(modelKey);
  if (whisperPipeline && activeModelKey === modelKey && activeModelPath === modelPath && activeCacheName === cacheName) {
    return { runtime: "wasm" };
  }
  if (whisperPipelinePromise) {
    return whisperPipelinePromise;
  }
  whisperPipelinePromise = (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = buildCustomCache(cacheName);
    if (whisperPipeline && typeof whisperPipeline.dispose === "function") {
      await whisperPipeline.dispose();
    }
    whisperPipeline = await pipeline("automatic-speech-recognition", modelPath, {
      local_files_only: true,
      device: "wasm",
      dtype: "q8",
      progress_callback: (progress) => {
        const stage = String(progress?.status || "").trim();
        const file = String(progress?.file || "").trim();
        const percent = Number.isFinite(Number(progress?.progress)) ? Math.max(0, Math.min(100, Math.round(Number(progress.progress)))) : null;
        if (!["initiate", "download", "progress", "done"].includes(stage)) return;
        onProgress?.({
          file,
          overallProgress: stage === "done" ? 100 : percent,
          statusText:
            stage === "done"
              ? file ? `已缓存 ${file}` : "Whisper 资源已缓存"
              : percent == null
                ? `正在下载 ${file || "Whisper 资源"}`
                : `正在下载 ${file || "Whisper 资源"} ${percent}%`,
        });
      },
    });
    activeModelKey = modelKey;
    activeModelPath = modelPath;
    activeCacheName = cacheName;
    return { runtime: "wasm" };
  })().finally(() => {
    whisperPipelinePromise = null;
  });
  return whisperPipelinePromise;
}

export async function transcribeWithLocalWhisper(modelKey, audioData, samplingRate = 16000) {
  if (!(audioData instanceof Float32Array)) {
    throw new Error("音频数据无效，必须是 Float32Array");
  }
  await ensureLocalWhisperPipeline(modelKey);
  const totalStart = nowMs();
  const decodeStart = nowMs();
  const result = await whisperPipeline(audioData, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
    force_full_sequences: false,
  });
  const workerDecodeMs = Math.max(0, Math.round(nowMs() - decodeStart));
  const postprocessStart = nowMs();
  const totalDurationMs = Math.max(1, Math.round((audioData.length / Math.max(1, samplingRate)) * 1000));
  const wordItems = buildWordItems(result, samplingRate, audioData.length);
  const sentenceEntries = buildSentenceEntries(wordItems, result?.text, totalDurationMs);
  const previewText = String(result?.text || composeText(sentenceEntries.map((item) => item.text).join(" ")) || "").trim();
  const asrPayload = {
    source: "local_browser_asr",
    engine: "transformersjs_whisper",
    transcripts: [
      {
        text: previewText,
        lang: "en",
        emotion: "",
        event: "",
        words: wordItems.map((item) => ({
          text: String(item.text || item.surface || "").trim(),
          surface: String(item.surface || item.text || "").trim(),
          begin_time: Math.max(0, Number(item.begin_ms || 0)),
          end_time: Math.max(0, Number(item.end_ms || 0)),
        })),
        sentences: sentenceEntries.map((item) => ({
          text: String(item.text || "").trim(),
          begin_time: Math.max(0, Number(item.begin_ms || 0)),
          end_time: Math.max(0, Number(item.end_ms || 0)),
        })),
      },
    ],
  };
  return {
    runtime: "wasm",
    preview_text: previewText,
    segments: sentenceEntries,
    raw_result: result,
    asr_payload: asrPayload,
    metrics: {
      worker_decode_ms: workerDecodeMs,
      postprocess_ms: Math.max(0, Math.round(nowMs() - postprocessStart)),
      total_local_asr_ms: Math.max(0, Math.round(nowMs() - totalStart)),
    },
  };
}
