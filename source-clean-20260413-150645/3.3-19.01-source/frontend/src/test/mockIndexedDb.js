function createRequest(executor) {
  const request = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };

  queueMicrotask(() => {
    try {
      executor(request);
    } catch (error) {
      request.error = error;
      request.onerror?.({ target: request });
    }
  });

  return request;
}

function createDbFacade(record) {
  return {
    createObjectStore(name, options = {}) {
      if (!record.stores.has(name)) {
        record.stores.set(name, {
          keyPath: options.keyPath || "id",
          records: new Map(),
          indexes: new Map(),
        });
      }
      const store = record.stores.get(name);
      return {
        createIndex(indexName, keyPath) {
          store.indexes.set(indexName, keyPath);
        },
      };
    },
    transaction(storeName) {
      const store = record.stores.get(storeName);
      if (!store) {
        throw new Error(`Store not found: ${storeName}`);
      }

      const tx = {
        oncomplete: null,
        onerror: null,
        _pending: 0,
      };

      function maybeComplete() {
        if (tx._pending === 0) {
          queueMicrotask(() => tx.oncomplete?.({ target: tx }));
        }
      }

      function runOperation(operation) {
        tx._pending += 1;
        const request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
        };

        queueMicrotask(() => {
          try {
            request.result = operation();
            request.onsuccess?.({ target: request });
          } catch (error) {
            request.error = error;
            tx.onerror?.({ target: tx });
            request.onerror?.({ target: request });
          } finally {
            tx._pending -= 1;
            maybeComplete();
          }
        });

        return request;
      }

      tx.objectStore = () => ({
        put(value) {
          return runOperation(() => {
            const key = value?.[store.keyPath];
            store.records.set(key, structuredClone(value));
            return key;
          });
        },
        get(key) {
          return runOperation(() => structuredClone(store.records.get(key)));
        },
        getAll() {
          return runOperation(() => Array.from(store.records.values(), (value) => structuredClone(value)));
        },
        delete(key) {
          return runOperation(() => {
            store.records.delete(key);
            return undefined;
          });
        },
        clear() {
          return runOperation(() => {
            store.records.clear();
            return undefined;
          });
        },
      });

      return tx;
    },
    get objectStoreNames() {
      return {
        contains(name) {
          return record.stores.has(name);
        },
      };
    },
  };
}

export function installMockIndexedDb() {
  const databases = new Map();

  const mock = {
    open(name, version = 1) {
      return createRequest((request) => {
        const existing = databases.get(name);
        const needsUpgrade = !existing || version > existing.version;
        const record = existing || { version, stores: new Map() };
        if (needsUpgrade) {
          record.version = version;
          databases.set(name, record);
          const db = createDbFacade(record);
          request.result = db;
          request.onupgradeneeded?.({ target: { result: db } });
        }
        const finalRecord = databases.get(name) || record;
        request.result = createDbFacade(finalRecord);
        request.onsuccess?.({ target: request });
      });
    },
    deleteDatabase(name) {
      return createRequest((request) => {
        databases.delete(name);
        request.result = undefined;
        request.onsuccess?.({ target: request });
      });
    },
  };

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: mock,
  });

  return {
    reset() {
      databases.clear();
    },
  };
}
