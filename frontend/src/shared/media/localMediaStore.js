const DB_NAME = "english_trainer_local_media";
const DB_VERSION = 1;
const STORE_NAME = "lesson_media";
const COVER_CAPTURE_VERSION = 2;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

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

function drawVideoFrameToDataUrl(video) {
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
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function captureVideoFrame(video, timeSec, { seek = false } = {}) {
  if (seek) {
    await seekVideoTo(video, timeSec);
  }
  await waitForReadyState(video, HAVE_CURRENT_DATA, "loadeddata", 1500);
  await waitForRenderedVideoFrame(video);
  await waitForAnimationFrame(1);
  return drawVideoFrameToDataUrl(video);
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

        let dataUrl = "";
        try {
          dataUrl = await captureVideoFrame(video, 0, { seek: false });
        } catch (_) {
          dataUrl = "";
        }

        if (!dataUrl) {
          const duration = Number.isFinite(video.duration) ? Math.max(0, Number(video.duration || 0)) : 0;
          const fallbackTimeSec = duration > 0 ? Math.min(0.05, Math.max(0.001, duration / 2)) : 0.05;
          console.debug("[DEBUG] localMediaStore.cover.capture_fallback", {
            fileName: String(fallbackFileName || ""),
            fallbackTimeSec,
          });
          try {
            dataUrl = await captureVideoFrame(video, fallbackTimeSec, { seek: true });
          } catch (_) {
            dataUrl = "";
          }
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
  console.debug("[DEBUG] localMediaStore.save", { lessonId: normalizedLessonId, sizeBytes: payload.size_bytes });
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
        if (storedCoverVersion > 0 && storedCoverVersion < COVER_CAPTURE_VERSION) {
          console.debug("[DEBUG] localMediaStore.cover.refresh_legacy", {
            lessonId: normalizedLessonId,
            previousVersion: storedCoverVersion,
          });
        }
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
        console.debug("[DEBUG] localMediaStore.cover.backfill", { lessonId: normalizedLessonId });
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
  console.debug("[DEBUG] localMediaStore.delete", { lessonId: normalizedLessonId });
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
