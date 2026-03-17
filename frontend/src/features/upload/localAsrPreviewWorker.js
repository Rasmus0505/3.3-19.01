const TARGET_SAMPLE_RATE = 16000;
const DEFAULT_MODEL_ID = "local-sensevoice-small";
const DEFAULT_ASSET_BASE_URL = "/api/local-asr-assets";

const RUNTIME_FILES = {
  asrScript: "sherpa-onnx-asr.js",
  runtimeScript: "sherpa-onnx-wasm-main-vad-asr.js",
  runtimeWasm: "sherpa-onnx-wasm-main-vad-asr.wasm",
  runtimeData: "sherpa-onnx-wasm-main-vad-asr.data",
};

let runtimePromise = null;
let runtimeModule = null;
let activeRecognizer = null;
let activeModelId = "";
let activeAssetBaseUrl = "";
let runtimeInitialized = false;

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || "未知错误");
}

function normalizeModelId(modelId) {
  return String(modelId || "").trim() || DEFAULT_MODEL_ID;
}

function normalizeAssetBaseUrl(assetBaseUrl) {
  return String(assetBaseUrl || DEFAULT_ASSET_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_ASSET_BASE_URL;
}

function buildAssetUrl(assetBaseUrl, fileName) {
  return `${normalizeAssetBaseUrl(assetBaseUrl)}/${String(fileName || "").replace(/^\/+/, "")}`;
}

function buildProgressPayload(requestId, stage, payload = {}) {
  return {
    type: "progress",
    requestId,
    stage,
    modelId: normalizeModelId(payload.modelId),
    ...payload,
  };
}

function buildResultPayload(requestId, action, payload = {}) {
  return {
    type: "result",
    requestId,
    action,
    model_id: normalizeModelId(payload.model_id || payload.modelId),
    ...payload,
  };
}

function buildErrorPayload(requestId, action, error, payload = {}) {
  return {
    type: "error",
    requestId,
    action,
    model_id: normalizeModelId(payload.model_id || payload.modelId),
    message: toErrorMessage(error),
    ...payload,
  };
}

function postDebugLog(message, extra = {}) {
  console.debug("[DEBUG] local_asr.worker", message, extra);
}

function postProgress(requestId, stage, payload = {}) {
  self.postMessage(buildProgressPayload(requestId, stage, payload));
}

function computeProgressPercent(loaded, total) {
  const safeLoaded = Number(loaded || 0);
  const safeTotal = Number(total || 0);
  if (!Number.isFinite(safeLoaded) || !Number.isFinite(safeTotal) || safeTotal <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((safeLoaded / safeTotal) * 100)));
}

function fileExists(filename) {
  if (!runtimeModule) return 0;
  const fileName = String(filename || "").trim();
  const fileNameLen = runtimeModule.lengthBytesUTF8(fileName) + 1;
  const pointer = runtimeModule._malloc(fileNameLen);
  runtimeModule.stringToUTF8(fileName, pointer, fileNameLen);
  const exists = runtimeModule._SherpaOnnxFileExists(pointer);
  runtimeModule._free(pointer);
  return exists;
}

function createRecognizer(Module) {
  if (typeof OfflineRecognizer !== "function") {
    throw new Error("sherpa-onnx OfflineRecognizer 未加载成功");
  }
  if (fileExists("sense-voice.onnx") !== 1) {
    throw new Error("SenseVoice 模型文件未就绪");
  }
  if (fileExists("tokens.txt") !== 1) {
    throw new Error("SenseVoice tokens 文件未就绪");
  }
  const config = {
    modelConfig: {
      debug: 0,
      tokens: "./tokens.txt",
      senseVoice: {
        model: "./sense-voice.onnx",
        useInverseTextNormalization: 1,
      },
    },
  };
  postDebugLog("recognizer.create", { modelId: activeModelId, assetBaseUrl: activeAssetBaseUrl });
  return new OfflineRecognizer(config, Module);
}

function resetRuntimeState() {
  if (activeRecognizer && typeof activeRecognizer.free === "function") {
    try {
      activeRecognizer.free();
    } catch (_) {
      // Ignore recognizer cleanup failures.
    }
  }
  activeRecognizer = null;
  runtimePromise = null;
  runtimeModule = null;
  runtimeInitialized = false;
}

function handleModuleStatus(requestId, modelId, status) {
  const statusText = String(status || "").trim();
  if (!statusText) return;

  if (statusText === "Running...") {
    postProgress(requestId, "model-progress", {
      modelId,
      runtime: "wasm",
      progress: 100,
      status: "模型资源已下载，正在初始化 SenseVoice",
      status_text: "模型资源已下载，正在初始化 SenseVoice",
      file: RUNTIME_FILES.runtimeData,
    });
    return;
  }

  const downloadMatch = statusText.match(/Downloading data\.\.\. \((\d+)\/(\d+)\)/);
  if (downloadMatch) {
    const loaded = Number(downloadMatch[1] || 0);
    const total = Number(downloadMatch[2] || 0);
    const progress = computeProgressPercent(loaded, total);
    postProgress(requestId, "model-progress", {
      modelId,
      runtime: "wasm",
      file: RUNTIME_FILES.runtimeData,
      loaded,
      total,
      progress,
      status: progress == null ? "正在下载本地 SenseVoice 资源" : `正在下载本地 SenseVoice 资源 ${progress}%`,
      status_text: progress == null ? "正在下载本地 SenseVoice 资源" : `正在下载本地 SenseVoice 资源 ${progress}%`,
    });
    return;
  }

  postProgress(requestId, "model-progress", {
    modelId,
    runtime: "wasm",
    progress: null,
    status: statusText,
    status_text: statusText,
  });
}

async function ensureRuntime(requestId, modelId, assetBaseUrl) {
  const normalizedModelId = normalizeModelId(modelId);
  const normalizedAssetBaseUrl = normalizeAssetBaseUrl(assetBaseUrl);

  if (runtimeInitialized && runtimeModule && activeRecognizer) {
    return { runtime: "wasm", modelId: normalizedModelId };
  }

  if (runtimeInitialized && runtimeModule && !activeRecognizer) {
    activeRecognizer = createRecognizer(runtimeModule);
    return { runtime: "wasm", modelId: normalizedModelId };
  }

  if (runtimePromise) {
    return runtimePromise;
  }

  activeModelId = normalizedModelId;
  activeAssetBaseUrl = normalizedAssetBaseUrl;

  postProgress(requestId, "model-load-start", {
    modelId: normalizedModelId,
    runtime: "wasm",
    status_text: "正在检查并下载本地 SenseVoice 资源",
  });

  runtimePromise = new Promise((resolve, reject) => {
    try {
      self.Module = {
        locateFile(path) {
          if (path === RUNTIME_FILES.runtimeWasm || path === RUNTIME_FILES.runtimeData) {
            return buildAssetUrl(normalizedAssetBaseUrl, path);
          }
          return buildAssetUrl(normalizedAssetBaseUrl, path);
        },
        setStatus(status) {
          handleModuleStatus(requestId, normalizedModelId, status);
        },
        onRuntimeInitialized() {
          try {
            runtimeModule = self.Module;
            activeRecognizer = createRecognizer(runtimeModule);
            runtimeInitialized = true;
            postDebugLog("runtime.ready", { modelId: normalizedModelId, assetBaseUrl: normalizedAssetBaseUrl });
            postProgress(requestId, "model-ready", {
              modelId: normalizedModelId,
              runtime: "wasm",
              progress: 100,
              status_text: "本地 SenseVoice 模型已就绪",
            });
            resolve({ runtime: "wasm", modelId: normalizedModelId });
          } catch (error) {
            reject(error);
          }
        },
      };

      importScripts(buildAssetUrl(normalizedAssetBaseUrl, RUNTIME_FILES.asrScript));
      importScripts(buildAssetUrl(normalizedAssetBaseUrl, RUNTIME_FILES.runtimeScript));
    } catch (error) {
      reject(error);
    }
  })
    .catch((error) => {
      postDebugLog("runtime.error", { message: toErrorMessage(error) });
      resetRuntimeState();
      throw error;
    })
    .finally(() => {
      runtimePromise = null;
    });

  return runtimePromise;
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
    const endMs = isLast
      ? totalDurationMs
      : Math.max(beginMs + 1, cursor + Math.round((weight / Math.max(totalWeight, 1)) * totalDurationMs));
    cursor = endMs;
    return {
      text: stripSurfacePunctuation(surface) || surface,
      surface,
      begin_ms: beginMs,
      end_ms: endMs,
    };
  });
}

function decodeTimedWordsFromTokens(result) {
  const tokens = Array.isArray(result?.tokens) ? result.tokens : [];
  const timestamps = Array.isArray(result?.timestamps) ? result.timestamps : [];
  const durations = Array.isArray(result?.durations) ? result.durations : [];
  if (!tokens.length || timestamps.length !== tokens.length || durations.length !== tokens.length) {
    return [];
  }

  const words = [];
  let currentWord = null;

  function flushCurrentWord() {
    if (!currentWord) return;
    const surface = normalizeSurfaceText(currentWord.surface);
    if (surface && currentWord.end_ms > currentWord.begin_ms) {
      words.push({
        text: stripSurfacePunctuation(surface) || surface,
        surface,
        begin_ms: currentWord.begin_ms,
        end_ms: currentWord.end_ms,
      });
    }
    currentWord = null;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const rawToken = String(tokens[index] || "").trim();
    if (!rawToken || /^<.*>$/.test(rawToken) || /^<\|.*\|>$/.test(rawToken)) {
      continue;
    }

    const tokenBeginMs = Math.max(0, Math.round(Number(timestamps[index] || 0) * 1000));
    const tokenDurationMs = Math.max(1, Math.round(Number(durations[index] || 0) * 1000));
    const tokenEndMs = tokenBeginMs + tokenDurationMs;

    const startsWord = /^[▁Ġ]/u.test(rawToken);
    const normalizedToken = rawToken.replace(/^[▁Ġ]+/gu, "").replace(/[▁Ġ]/gu, " ").trim();
    if (!normalizedToken) {
      continue;
    }

    const punctuationOnly = /^[,.;!?，。！？；:：'"`~()\[\]{}-]+$/u.test(normalizedToken);

    if (!currentWord || startsWord) {
      flushCurrentWord();
      currentWord = {
        surface: normalizedToken,
        begin_ms: tokenBeginMs,
        end_ms: tokenEndMs,
      };
      continue;
    }

    if (punctuationOnly) {
      currentWord.surface = `${currentWord.surface}${normalizedToken}`;
      currentWord.end_ms = tokenEndMs;
      continue;
    }

    currentWord.surface = `${currentWord.surface}${normalizedToken}`;
    currentWord.end_ms = tokenEndMs;
  }

  flushCurrentWord();
  return words;
}

function chooseWordItems(result, samplingRate, sampleCount) {
  const timedWords = decodeTimedWordsFromTokens(result);
  const plainWords = splitTextIntoSurfaceWords(result?.text);
  if (timedWords.length > 0 && (plainWords.length === 0 || timedWords.length <= plainWords.length * 2)) {
    return timedWords;
  }
  const totalDurationMs = Math.max(1, Math.round((Math.max(0, Number(sampleCount || 0)) / Math.max(1, Number(samplingRate || TARGET_SAMPLE_RATE))) * 1000));
  return approximateWordsFromText(result?.text, totalDurationMs);
}

function buildSentenceEntries(words, fallbackText, totalDurationMs) {
  const sourceWords = Array.isArray(words) ? words : [];
  if (!sourceWords.length) {
    const text = normalizeSurfaceText(fallbackText);
    if (!text) return [];
    return [
      {
        id: `0-0-${totalDurationMs}`,
        text,
        begin_ms: 0,
        end_ms: Math.max(1, totalDurationMs),
      },
    ];
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
        id: `0-0-${totalDurationMs}`,
        text: composeText(sourceWords.map((item) => item.surface).join(" ")),
        begin_ms: 0,
        end_ms: Math.max(1, totalDurationMs),
      },
    ];
  }

  return sentences;
}

function buildAsrPayload(result, words, sentences) {
  const transcriptText = composeText(
    (Array.isArray(sentences) && sentences.length ? sentences : words).map((item) => item.text || item.surface).join(" "),
  );
  return {
    source: "local_browser_asr",
    engine: "sherpa_onnx_sensevoice",
    transcripts: [
      {
        text: transcriptText,
        lang: String(result?.lang || ""),
        emotion: String(result?.emotion || ""),
        event: String(result?.event || ""),
        words: words.map((item) => ({
          text: String(item.text || item.surface || "").trim(),
          surface: String(item.surface || item.text || "").trim(),
          begin_time: Math.max(0, Number(item.begin_ms || 0)),
          end_time: Math.max(0, Number(item.end_ms || 0)),
        })),
        sentences: sentences.map((item) => ({
          text: String(item.text || "").trim(),
          begin_time: Math.max(0, Number(item.begin_ms || 0)),
          end_time: Math.max(0, Number(item.end_ms || 0)),
        })),
      },
    ],
  };
}

self.addEventListener("message", async (event) => {
  const payload = event?.data || {};
  const action = String(payload?.type || "");
  const requestId = String(payload?.requestId || "");
  const modelId = normalizeModelId(payload?.modelId);
  const assetBaseUrl = normalizeAssetBaseUrl(payload?.assetBaseUrl);

  if (!action || !requestId) {
    return;
  }

  if (action === "load-model") {
    try {
      await ensureRuntime(requestId, modelId, assetBaseUrl);
      self.postMessage(
        buildResultPayload(requestId, action, {
          model_id: modelId,
          runtime: "wasm",
          sampling_rate: TARGET_SAMPLE_RATE,
          asset_base_url: assetBaseUrl,
        }),
      );
    } catch (error) {
      self.postMessage(buildErrorPayload(requestId, action, error, { modelId }));
    }
    return;
  }

  if (action === "dispose-model") {
    postDebugLog("dispose", { modelId });
    if (activeRecognizer && typeof activeRecognizer.free === "function") {
      try {
        activeRecognizer.free();
      } catch (_) {
        // Ignore recognizer cleanup failures.
      }
    }
    activeRecognizer = null;
    runtimeInitialized = Boolean(runtimeModule);
    self.postMessage(buildResultPayload(requestId, action, { model_id: modelId, runtime: "wasm" }));
    return;
  }

  if (action === "transcribe-audio") {
    try {
      await ensureRuntime(requestId, modelId, assetBaseUrl);
      const audioData = payload?.audioData;
      const samplingRate = Number(payload?.samplingRate || TARGET_SAMPLE_RATE);
      if (!(audioData instanceof Float32Array)) {
        throw new Error("音频数据无效，必须是 Float32Array");
      }

      postDebugLog("transcribe.start", {
        modelId,
        sampleCount: audioData.length,
        samplingRate,
      });
      postProgress(requestId, "transcribe-start", {
        modelId,
        runtime: "wasm",
        status_text: "正在本地识别字幕",
      });

      const stream = activeRecognizer.createStream();
      try {
        stream.acceptWaveform(samplingRate, audioData);
        activeRecognizer.decode(stream);
        const result = activeRecognizer.getResult(stream) || {};
        const totalDurationMs = Math.max(1, Math.round((audioData.length / Math.max(1, samplingRate)) * 1000));
        const wordItems = chooseWordItems(result, samplingRate, audioData.length);
        const sentenceEntries = buildSentenceEntries(wordItems, result?.text, totalDurationMs);
        const previewText = String(result?.text || composeText(sentenceEntries.map((item) => item.text).join(" ")) || "").trim();

        self.postMessage(
          buildResultPayload(requestId, action, {
            model_id: modelId,
            runtime: "wasm",
            preview_text: previewText,
            segments: sentenceEntries,
            raw_result: result,
            asr_payload: buildAsrPayload(result, wordItems, sentenceEntries),
          }),
        );
      } finally {
        stream.free();
      }
    } catch (error) {
      self.postMessage(buildErrorPayload(requestId, action, error, { modelId }));
    }
  }
});
