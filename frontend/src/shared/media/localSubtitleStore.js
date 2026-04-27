const DB_NAME = "english_trainer_local_subtitles";
const DB_VERSION = 3;
const STORE_NAME = "lesson_asr_cache";
const LEGACY_STORE_NAME = ["lesson", "subtitle", "variants"].join("_");

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持 IndexedDB");
  }
}

function normalizeLessonId(lessonId) {
  const rawValue = typeof lessonId === "number" ? lessonId : String(lessonId ?? "").trim();
  if (typeof rawValue === "number") {
    if (!Number.isInteger(rawValue) || rawValue <= 0) {
      throw new Error("lessonId 无效");
    }
    return rawValue;
  }
  if (!rawValue) {
    throw new Error("lessonId 无效");
  }
  const parsed = Number(rawValue);
  if (Number.isInteger(parsed) && parsed > 0 && String(parsed) === rawValue) {
    return parsed;
  }
  return rawValue;
}

function ensureStoreIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function openDatabase() {
  assertIndexedDbAvailable();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        db.deleteObjectStore(LEGACY_STORE_NAME);
      }
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "lesson_id" });
      ensureStoreIndex(store, "updated_at", "updated_at");
      ensureStoreIndex(store, "generated_at", "generated_at");
      ensureStoreIndex(store, "source_filename_lc", "source_filename_lc");
      ensureStoreIndex(store, "source_key", "source_key");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开 ASR 缓存失败"));
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
        request.onerror = () => reject(request.error || new Error("ASR 缓存操作失败"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("ASR 缓存事务失败"));
        };
      }),
  );
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeTimestamp(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const text = String(value || "").trim();
  if (!text) {
    return Math.max(0, Number(fallback || 0));
  }
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }
  return Math.max(0, Number(fallback || 0));
}

function normalizeErrorInfo(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { message: text } : null;
  }
  if (typeof value !== "object") return null;
  const code = String(value.code || value.error_code || "").trim();
  const message = String(value.message || value.detail || "").trim();
  if (!code && !message) return null;
  return { code, message };
}

function buildSearchText(lessonId, metadata = {}) {
  return [metadata.source_filename, metadata.source_key, lessonId]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function buildOfflineMetadata(lessonId, source = {}, options = {}, current = {}) {
  const metadata = options?.metadata && typeof options.metadata === "object" ? options.metadata : {};
  const sourceFilename = String(
    metadata.source_filename ||
      metadata.sourceFilename ||
      current.source_filename ||
      source?.source_filename ||
      "",
  ).trim();
  const generatedAt = normalizeTimestamp(
    metadata.generated_at ??
      metadata.generatedAt ??
      current.generated_at ??
      current.updated_at ??
      Date.now(),
    Date.now(),
  );
  const runtimeKind = String(metadata.runtime_kind || metadata.runtimeKind || current.runtime_kind || "").trim();
  const sourceKey = String(metadata.source_key || metadata.sourceKey || current.source_key || `lesson-${lessonId}`).trim();
  const errorInfo = normalizeErrorInfo(metadata.error_info ?? metadata.errorInfo ?? current.error_info ?? null);
  const normalized = {
    source_key: sourceKey || `lesson-${lessonId}`,
    runtime_kind: runtimeKind,
    source_filename: sourceFilename,
    source_filename_lc: sourceFilename.toLowerCase(),
    generated_at: generatedAt,
    error_info: errorInfo,
  };
  return {
    ...normalized,
    search_text: buildSearchText(lessonId, normalized),
  };
}

function normalizeOfflineListItem(record) {
  const lessonId = normalizeLessonId(record?.lesson_id);
  return {
    lessonId,
    sourceFilename: String(record?.source_filename || "").trim(),
    sourceKey: String(record?.source_key || "").trim(),
    runtimeKind: String(record?.runtime_kind || "").trim(),
    generatedAt: normalizeTimestamp(record?.generated_at, 0),
    updatedAt: normalizeTimestamp(record?.updated_at, 0),
    errorInfo: normalizeErrorInfo(record?.error_info),
    hasSource: Boolean(record?.asr_payload && typeof record.asr_payload === "object"),
    searchText: String(record?.search_text || buildSearchText(lessonId, record)).trim().toLowerCase(),
  };
}

function compareLessonIds(leftLessonId, rightLessonId) {
  const leftIsNumber = typeof leftLessonId === "number";
  const rightIsNumber = typeof rightLessonId === "number";
  if (leftIsNumber && rightIsNumber) {
    return rightLessonId - leftLessonId;
  }
  return String(rightLessonId || "").localeCompare(String(leftLessonId || ""));
}

export async function getLessonSubtitleCache(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const result = await withStore("readonly", (store) => store.get(normalizedLessonId));
  if (!result || typeof result !== "object") {
    return null;
  }
  return result;
}

export async function saveLessonSubtitleCacheSeed(lessonId, seed, options = {}) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const current = (await getLessonSubtitleCache(normalizedLessonId)) || { lesson_id: normalizedLessonId };
  const offlineMetadata = buildOfflineMetadata(normalizedLessonId, seed, options, current);
  const payload = {
    lesson_id: normalizedLessonId,
    asr_payload: cloneJsonSafe(seed?.asr_payload || current.asr_payload || {}),
    updated_at: Date.now(),
    ...offlineMetadata,
  };
  await withStore("readwrite", (store) => store.put(payload));
  console.debug("[DEBUG] localSubtitleStore.asr.save", {
    lessonId: normalizedLessonId,
    sourceFilename: payload.source_filename,
  });
  return payload;
}

export async function listOfflineSubtitles({ searchQuery = "", limit = 20, offset = 0 } = {}) {
  const normalizedSearchQuery = String(searchQuery || "").trim().toLowerCase();
  const normalizedLimit = Math.max(1, Number(limit || 20));
  const normalizedOffset = Math.max(0, Number(offset || 0));
  const rawRecords = await withStore("readonly", (store) => store.getAll());
  const items = (Array.isArray(rawRecords) ? rawRecords : [])
    .map((record) => {
      try {
        return normalizeOfflineListItem(record);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => item.hasSource)
    .filter((item) => {
      if (!normalizedSearchQuery) return true;
      return item.searchText.includes(normalizedSearchQuery);
    })
    .sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      if (right.generatedAt !== left.generatedAt) {
        return right.generatedAt - left.generatedAt;
      }
      return compareLessonIds(left.lessonId, right.lessonId);
    });
  return {
    items: items.slice(normalizedOffset, normalizedOffset + normalizedLimit),
    total: items.length,
    limit: normalizedLimit,
    offset: normalizedOffset,
    searchQuery: String(searchQuery || ""),
  };
}

export function isOffline({ serverStatus = {}, navigatorOnline } = {}) {
  const currentOnline =
    typeof navigatorOnline === "boolean"
      ? navigatorOnline
      : typeof navigator !== "undefined"
        ? navigator.onLine !== false
        : true;
  if (!currentOnline) {
    return true;
  }
  return serverStatus?.reachable === false;
}

export async function deleteLessonSubtitleCache(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  await withStore("readwrite", (store) => store.delete(normalizedLessonId));
  console.debug("[DEBUG] localSubtitleStore.delete", { lessonId: normalizedLessonId });
}
