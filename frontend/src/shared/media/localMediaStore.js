const DB_NAME = "english_trainer_local_media";
const DB_VERSION = 1;
const STORE_NAME = "lesson_media";

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
    const isVideo = mediaType.toLowerCase().startsWith("video/");
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

export async function saveLessonMedia(lessonId, file) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  if (!(file instanceof Blob)) {
    throw new Error("需要有效的媒体文件");
  }

  let durationSeconds = 0;
  try {
    durationSeconds = await readMediaDurationSeconds(file, file.name || "");
  } catch (_) {
    durationSeconds = 0;
  }

  const mediaType = String(file.type || inferMediaTypeFromFileName(file.name || ""));
  const payload = {
    lesson_id: normalizedLessonId,
    file_name: String(file.name || `lesson_${normalizedLessonId}`),
    media_type: mediaType,
    size_bytes: Number(file.size || 0),
    duration_seconds: durationSeconds,
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
