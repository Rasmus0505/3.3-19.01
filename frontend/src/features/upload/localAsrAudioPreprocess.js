export const LOCAL_ASR_TARGET_SAMPLE_RATE = 16000;
export const LOCAL_ASR_LONG_AUDIO_HINT_SECONDS = 8 * 60;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function roundMs(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function isMp4File(file) {
  return String(file?.type || "").toLowerCase() === "video/mp4" || /\.mp4$/i.test(String(file?.name || ""));
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

function buildDecodeError(file, error) {
  if (isMp4File(file)) {
    return new Error("当前 MP4 编码无法本地试玩，请改传音频或使用云端识别。");
  }
  return new Error(`本地解析音频失败: ${error instanceof Error && error.message ? error.message : String(error)}`);
}

function getAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function getOfflineAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return window.OfflineAudioContext || window.webkitOfflineAudioContext || null;
}

async function resampleWithOfflineAudioContext(audioBuffer, targetSampleRate) {
  const OfflineAudioContextCtor = getOfflineAudioContextCtor();
  if (!OfflineAudioContextCtor) {
    return null;
  }
  const frameCount = Math.max(1, Math.ceil(Number(audioBuffer?.duration || 0) * targetSampleRate));
  const offlineContext = new OfflineAudioContextCtor(1, frameCount, targetSampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();
  return new Float32Array(renderedBuffer.getChannelData(0));
}

async function convertAudioBuffer(audioBuffer, targetSampleRate) {
  const sourceSampleRate = Math.max(1, Number(audioBuffer?.sampleRate || 0));
  const channelCount = Math.max(1, Number(audioBuffer?.numberOfChannels || 1));
  if (channelCount === 1 && sourceSampleRate === targetSampleRate) {
    return {
      audioData: new Float32Array(audioBuffer.getChannelData(0)),
      resampleStrategy: "direct-copy",
    };
  }
  try {
    const nativeAudioData = await resampleWithOfflineAudioContext(audioBuffer, targetSampleRate);
    if (nativeAudioData instanceof Float32Array && nativeAudioData.length > 0) {
      return {
        audioData: nativeAudioData,
        resampleStrategy: "offline-audio-context",
      };
    }
  } catch (_) {
    // Fall back to the JS implementation if native rendering fails.
  }
  const mono = mixAudioBufferToMono(audioBuffer);
  return {
    audioData: resampleFloat32(mono, sourceSampleRate, targetSampleRate),
    resampleStrategy: "js-fallback",
  };
}

export function buildLocalAsrLongAudioWarning(durationSec, thresholdSec = LOCAL_ASR_LONG_AUDIO_HINT_SECONDS) {
  const safeDurationSec = Math.max(0, Number(durationSec || 0));
  if (safeDurationSec <= Math.max(1, Number(thresholdSec || 0))) {
    return "";
  }
  const minutes = safeDurationSec >= 600 ? Math.round(safeDurationSec / 60) : Math.round((safeDurationSec / 60) * 10) / 10;
  return `当前素材约 ${minutes} 分钟，WASM 模式会明显较慢，更建议改用高速模式。`;
}

export async function preprocessLocalAsrFile(file, options = {}) {
  const targetSampleRate = Math.max(1, Number(options?.targetSampleRate || LOCAL_ASR_TARGET_SAMPLE_RATE));
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    throw new Error("当前浏览器不支持 AudioContext，无法试玩本地 ASR");
  }
  const audioContext = new AudioContextCtor();
  const totalStart = nowMs();
  try {
    const decodeStart = nowMs();
    const fileBytes = await file.arrayBuffer();
    let audioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(fileBytes.slice(0));
    } catch (error) {
      throw buildDecodeError(file, error);
    }
    const decodeMs = roundMs(nowMs() - decodeStart);
    const resampleStart = nowMs();
    const { audioData, resampleStrategy } = await convertAudioBuffer(audioBuffer, targetSampleRate);
    const resampleMs = roundMs(nowMs() - resampleStart);
    return {
      audioData,
      durationSec: Math.max(0, Number(audioBuffer?.duration || 0)),
      metrics: {
        audio_extract_ms: 0,
        decode_ms: decodeMs,
        resample_ms: resampleMs,
        preprocess_ms: roundMs(nowMs() - totalStart),
        source_sample_rate: Math.max(1, Number(audioBuffer?.sampleRate || 0)),
        target_sample_rate: targetSampleRate,
        channel_count: Math.max(1, Number(audioBuffer?.numberOfChannels || 1)),
        input_bytes: Math.max(0, Number(fileBytes?.byteLength || 0)),
        sample_count: Math.max(0, Number(audioData?.length || 0)),
        resample_strategy: resampleStrategy,
      },
    };
  } finally {
    try {
      await audioContext.close();
    } catch (_) {
      // Ignore audio context close failures.
    }
  }
}
