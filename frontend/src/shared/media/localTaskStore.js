const DB_NAME = "english_trainer_generation_tasks";
const DB_VERSION = 2;
const STORE_NAME = "generation_tasks";
const LEGACY_ACTIVE_KEY = "active";
const ACTIVE_KEY_PREFIX = "active_user:";

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("褰撳墠娴忚鍣ㄤ笉鏀寔 IndexedDB");
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
    request.onerror = () => reject(request.error || new Error("鎵撳紑鐢熸垚浠诲姟缂撳瓨澶辫触"));
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
        request.onerror = () => reject(request.error || new Error("鐢熸垚浠诲姟缂撳瓨澶辫触"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("鐢熸垚浠诲姟浜嬪姟澶辫触"));
        };
      }),
  );
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
