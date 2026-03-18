const DB_NAME = "english_trainer_local_asr_preview";
const DB_VERSION = 2;
const STORE_NAME = "model_state";

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持 IndexedDB");
  }
}

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function openDatabase() {
  assertIndexedDbAvailable();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "model_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开本地 ASR 缓存失败"));
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
        request.onerror = () => reject(request.error || new Error("本地 ASR 缓存读写失败"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("本地 ASR 缓存事务失败"));
        };
      }),
  );
}

export async function getLocalAsrPreviewState(modelId) {
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) return null;
  const record = await withStore("readonly", (store) => store.get(normalizedModelId));
  if (!record || typeof record !== "object") {
    return null;
  }
  return record;
}

export async function listLocalAsrPreviewStates() {
  const records = await withStore("readonly", (store) => store.getAll());
  return Array.isArray(records) ? records : [];
}

export async function saveLocalAsrPreviewState(modelId, payload) {
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) return null;
  const existing = await getLocalAsrPreviewState(normalizedModelId);
  const nextRecord = {
    model_id: normalizedModelId,
    status: String(payload?.status || existing?.status || "idle"),
    runtime: String(payload?.runtime || existing?.runtime || ""),
    webgpu_supported: Boolean(payload?.webgpu_supported ?? existing?.webgpu_supported),
    browser_supported: Boolean(payload?.browser_supported ?? existing?.browser_supported),
    last_error: String(payload?.last_error || ""),
    user_agent: String(payload?.user_agent || existing?.user_agent || ""),
    storage_mode: String(payload?.storage_mode || existing?.storage_mode || "browser-persistent-cache"),
    cache_version: String(payload?.cache_version || existing?.cache_version || ""),
    asset_base_url: String(payload?.asset_base_url || existing?.asset_base_url || ""),
    asset_manifest: payload?.asset_manifest && typeof payload.asset_manifest === "object" ? { ...payload.asset_manifest } : { ...(existing?.asset_manifest || {}) },
    verification_status: String(payload?.verification_status || existing?.verification_status || "unknown"),
    directory_binding_enabled: Boolean(payload?.directory_binding_enabled ?? existing?.directory_binding_enabled),
    directory_name: String(payload?.directory_name || existing?.directory_name || ""),
    directory_handle: payload?.directory_handle ?? existing?.directory_handle ?? null,
    last_verified_at: Number(payload?.last_verified_at ?? existing?.last_verified_at ?? 0),
    storage_summary: String(payload?.storage_summary || existing?.storage_summary || ""),
    updated_at: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(nextRecord));
  return nextRecord;
}

export async function deleteLocalAsrPreviewState(modelId) {
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) return;
  await withStore("readwrite", (store) => store.delete(normalizedModelId));
}
