import { pipeline } from "@huggingface/transformers";

const TASK_NAME = "automatic-speech-recognition";
const TARGET_SAMPLE_RATE = 16000;
const TRANSCRIBE_OPTIONS = {
  chunk_length_s: 20,
  stride_length_s: 5,
  return_timestamps: true,
};

let pipelinePromise = null;
let activeRuntime = "";
let activeModelId = "";

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || "未知错误");
}

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
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

function normalizeTimestampToMs(timestamp) {
  if (Array.isArray(timestamp) && timestamp.length >= 2) {
    const beginSec = Number(timestamp[0] || 0);
    const endSec = Number(timestamp[1] || beginSec || 0);
    return {
      begin_ms: Math.max(0, Math.round(beginSec * 1000)),
      end_ms: Math.max(0, Math.round(endSec * 1000)),
    };
  }
  if (timestamp && typeof timestamp === "object") {
    const beginSec = Number(timestamp.start ?? timestamp.begin ?? 0);
    const endSec = Number(timestamp.end ?? timestamp.stop ?? beginSec ?? 0);
    return {
      begin_ms: Math.max(0, Math.round(beginSec * 1000)),
      end_ms: Math.max(0, Math.round(endSec * 1000)),
    };
  }
  return { begin_ms: 0, end_ms: 0 };
}

function normalizeSegments(result) {
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (chunks.length > 0) {
    return chunks
      .map((chunk, index) => {
        const time = normalizeTimestampToMs(chunk?.timestamp);
        const text = String(chunk?.text || "").trim();
        if (!text) return null;
        return {
          id: `${index}-${time.begin_ms}-${time.end_ms}`,
          begin_ms: time.begin_ms,
          end_ms: Math.max(time.begin_ms, time.end_ms),
          text,
        };
      })
      .filter(Boolean);
  }

  const text = String(result?.text || "").trim();
  if (!text) return [];
  return [
    {
      id: "0-0-0",
      begin_ms: 0,
      end_ms: 0,
      text,
    },
  ];
}

function buildAsrPayload(segments) {
  const sentences = Array.isArray(segments)
    ? segments.map((segment) => ({
        text: String(segment.text || "").trim(),
        begin_time: Math.max(0, Number(segment.begin_ms || 0)),
        end_time: Math.max(0, Number(segment.end_ms || 0)),
      })).filter((segment) => segment.text && segment.end_time > segment.begin_time)
    : [];
  const transcriptText = sentences.map((item) => item.text).join(" ").trim();
  return {
    source: "local_browser_asr",
    transcripts: [
      {
        text: transcriptText,
        sentences,
      },
    ],
  };
}

async function createPipeline(requestId, modelId, preferredRuntime = "webgpu") {
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) {
    throw new Error("缺少本地模型 ID");
  }
  const runtimes = preferredRuntime === "wasm" ? ["wasm"] : ["webgpu", "wasm"];
  let lastError = null;

  for (const runtime of runtimes) {
    try {
      self.postMessage(
        buildProgressPayload(requestId, "model-load-start", {
          modelId: normalizedModelId,
          runtime,
          status_text: runtime === "webgpu" ? "正在尝试 WebGPU" : "正在回退到 WASM",
        }),
      );

      const instance = await pipeline(TASK_NAME, normalizedModelId, {
        device: runtime,
        progress_callback: (event) => {
          const progress = Number(event?.progress);
          const percent = Number.isFinite(progress)
            ? Math.max(0, Math.min(100, Math.round(progress)))
            : Number.isFinite(Number(event?.loaded)) && Number.isFinite(Number(event?.total)) && Number(event.total) > 0
              ? Math.max(0, Math.min(100, Math.round((Number(event.loaded) / Number(event.total)) * 100)))
              : null;
          self.postMessage(
            buildProgressPayload(requestId, "model-progress", {
              modelId: normalizedModelId,
              runtime,
              file: String(event?.file || ""),
              status: String(event?.status || ""),
              progress: percent,
              loaded: Number(event?.loaded || 0),
              total: Number(event?.total || 0),
            }),
          );
        },
      });

      activeRuntime = runtime;
      activeModelId = normalizedModelId;
      return instance;
    } catch (error) {
      lastError = error;
      if (runtime === "webgpu") {
        self.postMessage(
          buildProgressPayload(requestId, "runtime-fallback", {
            modelId: normalizedModelId,
            runtime: "wasm",
            status_text: "WebGPU 不可用，已自动回退到 WASM",
            detail: toErrorMessage(error),
          }),
        );
        continue;
      }
    }
  }

  throw lastError || new Error("本地 ASR 模型加载失败");
}

async function ensurePipeline(requestId, modelId, preferredRuntime = "webgpu") {
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) {
    throw new Error("缺少本地模型 ID");
  }
  if (!pipelinePromise || activeModelId !== normalizedModelId) {
    pipelinePromise = createPipeline(requestId, normalizedModelId, preferredRuntime).catch((error) => {
      pipelinePromise = null;
      activeRuntime = "";
      activeModelId = "";
      throw error;
    });
  }
  return pipelinePromise;
}

self.addEventListener("message", async (event) => {
  const payload = event?.data || {};
  const action = String(payload?.type || "");
  const requestId = String(payload?.requestId || "");
  const modelId = normalizeModelId(payload?.modelId);

  if (!action || !requestId) {
    return;
  }

  if (action === "load-model") {
    try {
      await ensurePipeline(requestId, modelId, String(payload?.preferredRuntime || "webgpu"));
      self.postMessage(
        buildResultPayload(requestId, action, {
          model_id: modelId,
          runtime: activeRuntime || "wasm",
          sampling_rate: TARGET_SAMPLE_RATE,
        }),
      );
    } catch (error) {
      self.postMessage(buildErrorPayload(requestId, action, error, { modelId }));
    }
    return;
  }

  if (action === "dispose-model") {
    if (activeModelId === modelId) {
      pipelinePromise = null;
      activeRuntime = "";
      activeModelId = "";
    }
    self.postMessage(buildResultPayload(requestId, action, { model_id: modelId }));
    return;
  }

  if (action === "transcribe-audio") {
    try {
      const transcriber = await ensurePipeline(requestId, modelId, String(payload?.preferredRuntime || "webgpu"));
      const audioData = payload?.audioData;
      if (!(audioData instanceof Float32Array)) {
        throw new Error("音频数据无效，必须是 Float32Array");
      }

      self.postMessage(
        buildProgressPayload(requestId, "transcribe-start", {
          modelId,
          runtime: activeRuntime || "wasm",
          status_text: "正在本地识别英文字幕",
        }),
      );

      const result = await transcriber(audioData, {
        ...TRANSCRIBE_OPTIONS,
        sampling_rate: Number(payload?.samplingRate || TARGET_SAMPLE_RATE),
      });
      const segments = normalizeSegments(result);
      const previewText = segments.map((item) => item.text).join(" ").trim();

      self.postMessage(
        buildResultPayload(requestId, action, {
          model_id: modelId,
          runtime: activeRuntime || "wasm",
          preview_text: previewText,
          segments,
          asr_payload: buildAsrPayload(segments),
        }),
      );
    } catch (error) {
      self.postMessage(buildErrorPayload(requestId, action, error, { modelId }));
    }
  }
});
