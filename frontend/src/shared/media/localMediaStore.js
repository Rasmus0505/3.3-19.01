const DB_NAME = "english_trainer_local_media";
const DB_VERSION = 1;
const STORE_NAME = "lesson_media";
const COVER_CAPTURE_VERSION = 3;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;
const COVER_SAMPLE_TIMES_SECONDS = [0, 0.05, 0.15, 0.3];
const COVER_BRIGHT_PIXEL_THRESHOLD = 28;
const COVER_MAX_BLACK_LUMA_THRESHOLD = 26;
const COVER_AVERAGE_BLACK_LUMA_THRESHOLD = 12;
const COVER_BRIGHT_PIXEL_RATIO_THRESHOLD = 0.03;

const MEDIA_TYPE_BY_EXT = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
};

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持 IndexedDB");
  }
}

function normalizeLessonId(lessonId) {
  const parsed = Number(lessonId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("lessonId 无效");
  }
  return parsed;
}

function inferMediaTypeFromFileName(fileName) {
  const safeName = String(fileName || "").toLowerCase();
  const ext = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")) : "";
  return MEDIA_TYPE_BY_EXT[ext] || "";
}

function isVideoMediaType(mediaType) {
  return String(mediaType || "").toLowerCase().startsWith("video/");
}

function waitForAnimationFrame(frameCount = 1) {
  return new Promise((resolve) => {
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 16);

    let remaining = Math.max(1, Number(frameCount) || 1);
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      raf(tick);
    };

    raf(tick);
  });
}

function waitForMediaEvent(media, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      media.removeEventListener(eventName, handleSuccess);
      media.removeEventListener("error", handleError);
    };

    const handleSuccess = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`媒体事件 ${eventName} 失败`));
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`媒体事件 ${eventName} 超时`));
    }, timeoutMs);

    media.addEventListener(eventName, handleSuccess, { once: true });
    media.addEventListener("error", handleError, { once: true });
  });
}

function waitForReadyState(media, minReadyState, eventName, timeoutMs = 2000) {
  if (Number(media?.readyState || 0) >= minReadyState) {
    return Promise.resolve();
  }
  return waitForMediaEvent(media, eventName, timeoutMs);
}

function waitForRenderedVideoFrame(video) {
  if (typeof video?.requestVideoFrameCallback === "function") {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, 250);

      video.requestVideoFrameCallback(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
    });
  }
  return waitForAnimationFrame(2);
}

async function seekVideoTo(video, timeSec) {
  const safeTime = Math.max(0, Number(timeSec) || 0);
  if (Math.abs(Number(video.currentTime || 0) - safeTime) <= 0.001) {
    return;
  }

  const seekedPromise = waitForMediaEvent(video, "seeked", 1500);
  video.currentTime = safeTime;
  await seekedPromise;
}

function drawVideoFrameToCanvas(video) {
  if (!video || Number(video.readyState || 0) < HAVE_CURRENT_DATA) {
    throw new Error("视频帧尚未就绪");
  }
  const width = Math.max(1, Number(video.videoWidth || 0));
  const height = Math.max(1, Number(video.videoHeight || 0));
  if (!width || !height) {
    throw new Error("视频尺寸无效");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建封面画布");
  }

  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

function isCanvasNearlyBlack(sourceCanvas) {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 16;
  sampleCanvas.height = 16;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleCtx) {
    return false;
  }

  sampleCtx.drawImage(sourceCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const { data } = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);

  let opaquePixels = 0;
  let brightPixels = 0;
  let totalLuma = 0;
  let maxLuma = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha <= 0) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    opaquePixels += 1;
    totalLuma += luma;
    maxLuma = Math.max(maxLuma, luma);
    if (luma >= COVER_BRIGHT_PIXEL_THRESHOLD) {
      brightPixels += 1;
    }
  }

  if (!opaquePixels) {
    return true;
  }

  const averageLuma = totalLuma / opaquePixels;
  const brightPixelRatio = brightPixels / opaquePixels;

  return (
    maxLuma < COVER_MAX_BLACK_LUMA_THRESHOLD ||
    (averageLuma < COVER_AVERAGE_BLACK_LUMA_THRESHOLD && brightPixelRatio < COVER_BRIGHT_PIXEL_RATIO_THRESHOLD)
  );
}

function canvasToDataUrl(canvas) {
  return canvas.toDataURL("image/jpeg", 0.85);
}

function getCoverSampleTimes(durationSeconds) {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, Number(durationSeconds || 0)) : null;
  const maxSeekTime = safeDuration == null ? null : Math.max(0, safeDuration - 0.001);
  const sampleTimes = COVER_SAMPLE_TIMES_SECONDS.map((timeSec) => {
    if (maxSeekTime == null) {
      return timeSec;
    }
    return Math.max(0, Math.min(timeSec, maxSeekTime));
  });
  return Array.from(new Set(sampleTimes.map((timeSec) => timeSec.toFixed(3)))).map((value) => Number(value));
}

async function captureVideoFrame(video, timeSec, { seek = false } = {}) {
  if (seek) {
    await seekVideoTo(video, timeSec);
  }
  await waitForReadyState(video, HAVE_CURRENT_DATA, "loadeddata", 1500);
  await waitForRenderedVideoFrame(video);
  await waitForAnimationFrame(1);
  const canvas = drawVideoFrameToCanvas(video);
  return {
    dataUrl: canvasToDataUrl(canvas),
    nearlyBlack: isCanvasNearlyBlack(canvas),
  };
}

function openDatabase() {
  assertIndexedDbAvailable();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "lesson_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开 IndexedDB 失败"));
  });
}

function withStore(mode, handler) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let request;
        try {
          request = handler(store);
        } catch (error) {
          reject(error);
          db.close();
          return;
        }

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB 操作失败"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("IndexedDB 事务失败"));
        };
      }),
  );
}

export function readMediaDurationSeconds(blob, fallbackFileName = "") {
  return new Promise((resolve, reject) => {
    const mediaType = String(blob?.type || inferMediaTypeFromFileName(fallbackFileName));
    const isVideo = isVideoMediaType(mediaType);
    const media = document.createElement(isVideo ? "video" : "audio");
    const url = URL.createObjectURL(blob);

    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const seconds = Number(media.duration || 0);
      URL.revokeObjectURL(url);
      resolve(seconds > 0 ? seconds : 0);
    };
    media.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("读取媒体时长失败"));
    };
    media.src = url;
  });
}

export function extractMediaCoverDataUrl(blob, fallbackFileName = "") {
  return new Promise((resolve) => {
    const mediaType = String(blob?.type || inferMediaTypeFromFileName(fallbackFileName));
    if (!isVideoMediaType(mediaType)) {
      resolve("");
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      try {
        video.pause();
      } catch (_) {
        // Ignore cleanup failures.
      }
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    void (async () => {
      try {
        video.src = objectUrl;
        video.load();
        await waitForReadyState(video, HAVE_METADATA, "loadedmetadata", 2000);

        const sampleTimes = getCoverSampleTimes(video.duration);
        let fallbackDataUrl = "";
        let dataUrl = "";

        for (const [index, timeSec] of sampleTimes.entries()) {
          try {
            const candidate = await captureVideoFrame(video, timeSec, { seek: index > 0 || timeSec > 0 });
            if (!candidate?.dataUrl) {
              continue;
            }
            fallbackDataUrl = candidate.dataUrl;
            if (!candidate.nearlyBlack) {
              dataUrl = candidate.dataUrl;
              break;
            }
          } catch (_) {
            // Ignore single frame capture failures and continue sampling.
          }
        }

        if (!dataUrl) {
          dataUrl = fallbackDataUrl;
        }

        cleanup();
        resolve(dataUrl);
      } catch (_) {
        cleanup();
        resolve("");
      }
    })();
  });
}

export async function saveLessonMedia(lessonId, file, options = {}) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  if (!(file instanceof Blob)) {
    throw new Error("需要有效的媒体文件");
  }

  let durationSeconds = 0;
  let coverDataUrl = "";
  const mediaType = String(file.type || inferMediaTypeFromFileName(file.name || ""));
  const providedCoverDataUrl = isVideoMediaType(mediaType) ? String(options?.coverDataUrl || "") : "";

  try {
    durationSeconds = await readMediaDurationSeconds(file, file.name || "");
  } catch (_) {
    durationSeconds = 0;
  }

  if (providedCoverDataUrl) {
    coverDataUrl = providedCoverDataUrl;
  } else {
    try {
      coverDataUrl = await extractMediaCoverDataUrl(file, file.name || "");
    } catch (_) {
      coverDataUrl = "";
    }
  }

  const payload = {
    lesson_id: normalizedLessonId,
    file_name: String(file.name || `lesson_${normalizedLessonId}`),
    media_type: mediaType,
    size_bytes: Number(file.size || 0),
    duration_seconds: durationSeconds,
    cover_data_url: coverDataUrl,
    cover_capture_version: coverDataUrl && isVideoMediaType(mediaType) ? COVER_CAPTURE_VERSION : 0,
    updated_at: Date.now(),
    blob: file,
  };

  await withStore("readwrite", (store) => store.put(payload));
  return payload;
}

export async function getLessonMedia(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const result = await withStore("readonly", (store) => store.get(normalizedLessonId));
  if (!result || !(result.blob instanceof Blob)) {
    return null;
  }
  return result;
}

export async function getLessonMediaPreview(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const media = await getLessonMedia(normalizedLessonId);
  if (!media) {
    return { lessonId: normalizedLessonId, hasMedia: false, mediaType: "", coverDataUrl: "", fileName: "" };
  }

  const mediaType = String(media.media_type || inferMediaTypeFromFileName(media.file_name || ""));
  let coverDataUrl = String(media.cover_data_url || "");
  const storedCoverVersion = Number(media.cover_capture_version || 0);
  const needsVideoCoverRefresh =
    media.blob instanceof Blob && isVideoMediaType(mediaType) && (!coverDataUrl || storedCoverVersion < COVER_CAPTURE_VERSION);

  if (needsVideoCoverRefresh) {
    try {
      const nextCoverDataUrl = await extractMediaCoverDataUrl(media.blob, media.file_name || "");
      if (nextCoverDataUrl) {
        coverDataUrl = nextCoverDataUrl;
        await withStore("readwrite", (store) =>
          store.put({
            ...media,
            media_type: mediaType,
            cover_data_url: coverDataUrl,
            cover_capture_version: COVER_CAPTURE_VERSION,
            updated_at: Date.now(),
          }),
        );
      }
    } catch (_) {
      coverDataUrl = String(media.cover_data_url || "");
    }
  }

  return {
    lessonId: normalizedLessonId,
    hasMedia: true,
    mediaType,
    coverDataUrl,
    fileName: String(media.file_name || ""),
  };
}

export async function hasLessonMedia(lessonId) {
  const media = await getLessonMedia(lessonId);
  return Boolean(media);
}

export async function deleteLessonMedia(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  await withStore("readwrite", (store) => store.delete(normalizedLessonId));
}

export async function getStorageEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  return navigator.storage.estimate();
}

export async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }
  return navigator.storage.persist();
}
