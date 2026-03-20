const DB_NAME = "english_trainer_generation_tasks";
const DB_VERSION = 2;
const STORE_NAME = "generation_tasks";
const LEGACY_ACTIVE_KEY = "active";
const ACTIVE_KEY_PREFIX = "active_user:";
const SUCCESS_SNAPSHOT_KEY_PREFIX = "success_user:";

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持 IndexedDB");
  }
}

function normalizeOwnerUserId(ownerUserId) {
  const normalized = Number(ownerUserId || 0);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

function buildScopedActiveKey(ownerUserId) {
  const normalized = normalizeOwnerUserId(ownerUserId);
  return normalized ? `${ACTIVE_KEY_PREFIX}${normalized}` : "";
}

function openDatabase() {
  assertIndexedDbAvailable();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.delete(LEGACY_ACTIVE_KEY);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开生成任务缓存失败"));
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
        request.onerror = () => reject(request.error || new Error("生成任务缓存失败"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("生成任务事务失败"));
        };
      }),
  );
}

function buildSuccessSnapshotKey(ownerUserId) {
  const normalized = normalizeOwnerUserId(ownerUserId);
  return normalized ? `${SUCCESS_SNAPSHOT_KEY_PREFIX}${normalized}` : "";
}

export async function saveActiveGenerationTask(ownerUserId, payload) {
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);
  const scopedKey = buildScopedActiveKey(normalizedOwnerUserId);
  if (!scopedKey) return;
  await withStore("readwrite", (store) => {
    store.delete(LEGACY_ACTIVE_KEY);
    return store.put({
      id: scopedKey,
      owner_user_id: normalizedOwnerUserId,
      ...payload,
      updated_at: Date.now(),
    });
  });
}

export async function getActiveGenerationTask(ownerUserId) {
  const scopedKey = buildScopedActiveKey(ownerUserId);
  if (!scopedKey) return null;
  const result = await withStore("readonly", (store) => store.get(scopedKey));
  if (!result || typeof result !== "object") {
    return null;
  }
  return normalizeOwnerUserId(result.owner_user_id) === normalizeOwnerUserId(ownerUserId) ? result : null;
}

export async function clearActiveGenerationTask(ownerUserId) {
  const scopedKey = buildScopedActiveKey(ownerUserId);
  if (!scopedKey) return;
  await withStore("readwrite", (store) => store.delete(scopedKey));
}

export async function saveUploadPanelSuccessSnapshot(ownerUserId, payload) {
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);
  const snapshotKey = buildSuccessSnapshotKey(normalizedOwnerUserId);
  if (!snapshotKey) return;
  await withStore("readwrite", (store) =>
    store.put({
      id: snapshotKey,
      owner_user_id: normalizedOwnerUserId,
      snapshot_type: "upload_success",
      ...payload,
      updated_at: Date.now(),
    }),
  );
}

export async function getUploadPanelSuccessSnapshot(ownerUserId) {
  const snapshotKey = buildSuccessSnapshotKey(ownerUserId);
  if (!snapshotKey) return null;
  const result = await withStore("readonly", (store) => store.get(snapshotKey));
  if (!result || typeof result !== "object") {
    return null;
  }
  return normalizeOwnerUserId(result.owner_user_id) === normalizeOwnerUserId(ownerUserId) ? result : null;
}

export async function clearUploadPanelSuccessSnapshot(ownerUserId) {
  const snapshotKey = buildSuccessSnapshotKey(ownerUserId);
  if (!snapshotKey) return;
  await withStore("readwrite", (store) => store.delete(snapshotKey));
}

export async function clearUploadPanelTaskSnapshots(ownerUserId) {
  await Promise.all([clearActiveGenerationTask(ownerUserId), clearUploadPanelSuccessSnapshot(ownerUserId)]);
}
