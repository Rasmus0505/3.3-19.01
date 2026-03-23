const DB_NAME = "english_trainer_local_subtitles";
const DB_VERSION = 2;
const STORE_NAME = "lesson_subtitle_variants";
const ORIGINAL_SUBTITLE_STRATEGY_VERSION = 2;
const PLAIN_VARIANT_KEY = "plain";

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
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "lesson_id" });
      ensureStoreIndex(store, "updated_at", "updated_at");
      ensureStoreIndex(store, "generated_at", "generated_at");
      ensureStoreIndex(store, "source_filename_lc", "source_filename_lc");
      ensureStoreIndex(store, "source_key", "source_key");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开字幕缓存失败"));
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
        request.onerror = () => reject(request.error || new Error("字幕缓存操作失败"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("字幕缓存事务失败"));
        };
      }),
  );
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function getVariantKey(semanticSplitEnabled) {
  return semanticSplitEnabled ? "semantic" : "plain";
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
  return {
    code,
    message,
  };
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
  const runtimeKind = String(
    metadata.runtime_kind ||
      metadata.runtimeKind ||
      current.runtime_kind ||
      "",
  ).trim();
  const sourceKey = String(
    metadata.source_key ||
      metadata.sourceKey ||
      current.source_key ||
      `lesson-${lessonId}`,
  ).trim();
  const errorInfo = normalizeErrorInfo(
    metadata.error_info ??
      metadata.errorInfo ??
      current.error_info ??
      null,
  );
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

function normalizeSentence(rawSentence, index) {
  const idx = Number.isInteger(rawSentence?.idx) ? rawSentence.idx : index;
  const textEn = String(rawSentence?.text_en || rawSentence?.text || "").trim();
  const tokens = Array.isArray(rawSentence?.tokens)
    ? rawSentence.tokens.map((item) => String(item || "").trim()).filter(Boolean)
    : textEn
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    idx,
    begin_ms: Math.max(0, Number(rawSentence?.begin_ms || 0)),
    end_ms: Math.max(0, Number(rawSentence?.end_ms || 0)),
    text_en: textEn,
    text_zh: String(rawSentence?.text_zh || ""),
    tokens,
    audio_url: rawSentence?.audio_url ?? null,
  };
}

function normalizeVariant(rawVariant) {
  if (!rawVariant || !Array.isArray(rawVariant.sentences)) {
    throw new Error("字幕变体无效");
  }
  const semanticSplitEnabled = Boolean(rawVariant.semantic_split_enabled);
  return {
    semantic_split_enabled: semanticSplitEnabled,
    split_mode: String(rawVariant.split_mode || ""),
    source_word_count: Math.max(0, Number(rawVariant.source_word_count || 0)),
    sentences: rawVariant.sentences.map((sentence, index) => normalizeSentence(sentence, index)),
    strategy_version: Math.max(1, Number(rawVariant.strategy_version || 1)),
    updated_at: Date.now(),
  };
}

function isVariantUsable(variantKey, variant) {
  if (!variant || typeof variant !== "object" || !Array.isArray(variant.sentences) || variant.sentences.length === 0) {
    return false;
  }
  if (variantKey === "semantic") {
    return true;
  }
  return (
    Number(variant.strategy_version || 0) >= ORIGINAL_SUBTITLE_STRATEGY_VERSION &&
    String(variant.split_mode || "") === "asr_sentences"
  );
}

function getUsableVariant(record, variantKey) {
  const variant = record?.variants?.[variantKey];
  return isVariantUsable(variantKey, variant) ? variant : null;
}

function getCurrentVariantKey(record) {
  const currentVariantKey = String(record?.current_variant_key || "");
  if (currentVariantKey === PLAIN_VARIANT_KEY && getUsableVariant(record, PLAIN_VARIANT_KEY)) {
    return PLAIN_VARIANT_KEY;
  }
  return getUsableVariant(record, PLAIN_VARIANT_KEY) ? PLAIN_VARIANT_KEY : "";
}

function buildPlainOnlyVariants(record, nextPlainVariant = null) {
  const currentPlainVariant = getUsableVariant(record, PLAIN_VARIANT_KEY);
  if (nextPlainVariant) {
    return { [PLAIN_VARIANT_KEY]: nextPlainVariant };
  }
  return currentPlainVariant ? { [PLAIN_VARIANT_KEY]: currentPlainVariant } : {};
}

function emptyAvailability(lessonId) {
  return {
    lessonId,
    hasSource: false,
    canRegenerate: false,
    currentVariantKey: "",
    currentSemanticSplitEnabled: null,
    hasPlainVariant: false,
    hasSemanticVariant: false,
    sourceFilename: "",
    updatedAt: 0,
    generatedAt: 0,
    runtimeKind: "",
    errorInfo: null,
  };
}

function normalizeOfflineListItem(record) {
  const lessonId = normalizeLessonId(record?.lesson_id);
  const currentVariantKey = getCurrentVariantKey(record);
  const activeVariant = currentVariantKey ? getUsableVariant(record, currentVariantKey) : null;
  return {
    lessonId,
    sourceFilename: String(record?.source_filename || "").trim(),
    sourceKey: String(record?.source_key || "").trim(),
    runtimeKind: String(record?.runtime_kind || "").trim(),
    generatedAt: normalizeTimestamp(record?.generated_at, 0),
    updatedAt: normalizeTimestamp(record?.updated_at, 0),
    errorInfo: normalizeErrorInfo(record?.error_info),
    currentVariantKey,
    sentenceCount: Array.isArray(activeVariant?.sentences) ? activeVariant.sentences.length : 0,
    hasSource: Boolean(record?.asr_payload && typeof record.asr_payload === "object"),
    hasPlainVariant: Boolean(getUsableVariant(record, PLAIN_VARIANT_KEY)),
    searchText: String(record?.search_text || buildSearchText(lessonId, record)).trim().toLowerCase(),
  };
}

export function getSubtitleVariantKey(semanticSplitEnabled) {
  return getVariantKey(Boolean(semanticSplitEnabled));
}

export async function getLessonSubtitleCache(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const result = await withStore("readonly", (store) => store.get(normalizedLessonId));
  if (!result || typeof result !== "object") {
    return null;
  }
  return result;
}

export async function getLessonSubtitleAvailability(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const record = await getLessonSubtitleCache(normalizedLessonId);
  if (!record) {
    return emptyAvailability(normalizedLessonId);
  }
  const currentVariantKey = getCurrentVariantKey(record);
  return {
    lessonId: normalizedLessonId,
    hasSource: Boolean(record.asr_payload && typeof record.asr_payload === "object"),
    canRegenerate: Boolean(record.asr_payload && typeof record.asr_payload === "object"),
    currentVariantKey,
    currentSemanticSplitEnabled: currentVariantKey === PLAIN_VARIANT_KEY ? false : null,
    hasPlainVariant: Boolean(getUsableVariant(record, PLAIN_VARIANT_KEY)),
    hasSemanticVariant: false,
    sourceFilename: String(record.source_filename || "").trim(),
    updatedAt: normalizeTimestamp(record.updated_at, 0),
    generatedAt: normalizeTimestamp(record.generated_at, 0),
    runtimeKind: String(record.runtime_kind || "").trim(),
    errorInfo: normalizeErrorInfo(record.error_info),
  };
}

export async function saveLessonSubtitleCacheSeed(lessonId, seed, options = {}) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const normalizedVariant = normalizeVariant(seed);
  const current = (await getLessonSubtitleCache(normalizedLessonId)) || { lesson_id: normalizedLessonId, variants: {} };
  const nextPlainVariant =
    normalizedVariant.semantic_split_enabled === false && isVariantUsable(PLAIN_VARIANT_KEY, normalizedVariant) ? normalizedVariant : null;
  const offlineMetadata = buildOfflineMetadata(normalizedLessonId, seed, options, current);
  const payload = {
    lesson_id: normalizedLessonId,
    asr_payload: cloneJsonSafe(seed?.asr_payload || current.asr_payload || {}),
    variants: buildPlainOnlyVariants(current, nextPlainVariant),
    current_variant_key: nextPlainVariant ? PLAIN_VARIANT_KEY : getCurrentVariantKey(current),
    updated_at: Date.now(),
    ...offlineMetadata,
  };
  await withStore("readwrite", (store) => store.put(payload));
  console.debug("[DEBUG] localSubtitleStore.seed.save", {
    lessonId: normalizedLessonId,
    sourceFilename: payload.source_filename,
    variantKey: nextPlainVariant ? PLAIN_VARIANT_KEY : "",
    usable: Boolean(nextPlainVariant),
  });
  return payload;
}

export async function getCachedLessonSubtitleVariant(lessonId, semanticSplitEnabled) {
  if (Boolean(semanticSplitEnabled)) return null;
  const normalizedLessonId = normalizeLessonId(lessonId);
  const record = await getLessonSubtitleCache(normalizedLessonId);
  if (!record) return null;
  return getUsableVariant(record, PLAIN_VARIANT_KEY);
}

export async function saveLessonSubtitleVariant(lessonId, variant, options = {}) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const normalizedVariant = normalizeVariant(variant);
  const current = (await getLessonSubtitleCache(normalizedLessonId)) || { lesson_id: normalizedLessonId, variants: {} };
  if (normalizedVariant.semantic_split_enabled || !isVariantUsable(PLAIN_VARIANT_KEY, normalizedVariant)) {
    return null;
  }
  const offlineMetadata = buildOfflineMetadata(normalizedLessonId, variant, options, current);
  const payload = {
    lesson_id: normalizedLessonId,
    asr_payload: cloneJsonSafe(current.asr_payload || {}),
    variants: buildPlainOnlyVariants(current, normalizedVariant),
    current_variant_key: options.makeActive === false ? getCurrentVariantKey(current) : PLAIN_VARIANT_KEY,
    updated_at: Date.now(),
    ...offlineMetadata,
  };
  await withStore("readwrite", (store) => store.put(payload));
  console.debug("[DEBUG] localSubtitleStore.variant.save", {
    lessonId: normalizedLessonId,
    sourceFilename: payload.source_filename,
    variantKey: PLAIN_VARIANT_KEY,
  });
  return payload.variants[PLAIN_VARIANT_KEY] || null;
}

export async function setActiveLessonSubtitleVariant(lessonId, semanticSplitEnabled) {
  if (Boolean(semanticSplitEnabled)) {
    return null;
  }
  const normalizedLessonId = normalizeLessonId(lessonId);
  const current = await getLessonSubtitleCache(normalizedLessonId);
  const nextVariant = getUsableVariant(current, PLAIN_VARIANT_KEY);
  if (!nextVariant) {
    return null;
  }
  await withStore("readwrite", (store) =>
    store.put({
      ...current,
      current_variant_key: PLAIN_VARIANT_KEY,
      updated_at: Date.now(),
    }),
  );
  console.debug("[DEBUG] localSubtitleStore.variant.activate", { lessonId: normalizedLessonId, variantKey: PLAIN_VARIANT_KEY });
  return nextVariant;
}

export async function getActiveLessonSubtitleVariant(lessonId) {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const record = await getLessonSubtitleCache(normalizedLessonId);
  if (!record) return null;
  const currentVariantKey = getCurrentVariantKey(record);
  if (!currentVariantKey) return null;
  return getUsableVariant(record, currentVariantKey);
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
    .filter((item) => item.hasSource || item.hasPlainVariant)
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
      return right.lessonId - left.lessonId;
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
