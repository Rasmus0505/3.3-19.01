const DB_NAME = "english_trainer_generation_tasks";
const DB_VERSION = 1;
const STORE_NAME = "generation_tasks";
const ACTIVE_KEY = "active";

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持 IndexedDB");
  }
}

function openDatabase() {
  assertIndexedDbAvailable();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
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

export async function saveActiveGenerationTask(payload) {
  await withStore("readwrite", (store) =>
    store.put({
      id: ACTIVE_KEY,
      ...payload,
      updated_at: Date.now(),
    }),
  );
}

export async function getActiveGenerationTask() {
  const result = await withStore("readonly", (store) => store.get(ACTIVE_KEY));
  return result && typeof result === "object" ? result : null;
}

export async function clearActiveGenerationTask() {
  await withStore("readwrite", (store) => store.delete(ACTIVE_KEY));
}
