"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DATABASE_NAME = "bottle-local-db";
const STORE_NAME = "sqlite";
const SNAPSHOT_KEY = "main";
const SCHEMA_VERSION = 3;
const SYNC_SCHEMA_PATH = path.resolve(__dirname, "schema.sql");
const SYNC_JOURNAL_MODULE_URL = pathToFileURL(path.resolve(__dirname, "sync-journal.mjs")).toString();

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_filename TEXT DEFAULT '',
        duration_ms INTEGER DEFAULT 0,
        runtime_kind TEXT DEFAULT '',
        asr_model TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT DEFAULT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        is_local_only INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );`,
      `CREATE TABLE IF NOT EXISTS lesson_sentences (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        sentence_index INTEGER NOT NULL,
        english_text TEXT NOT NULL DEFAULT '',
        chinese_text TEXT NOT NULL DEFAULT '',
        start_ms INTEGER DEFAULT 0,
        end_ms INTEGER DEFAULT 0,
        words_json TEXT NOT NULL DEFAULT '[]',
        variant_key TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(course_id, sentence_index)
      );`,
      "CREATE INDEX IF NOT EXISTS idx_lesson_sentences_course_id ON lesson_sentences(course_id);",
      `CREATE TABLE IF NOT EXISTS progress (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local-desktop-user',
        current_index INTEGER NOT NULL DEFAULT 0,
        completed_indices_json TEXT NOT NULL DEFAULT '[]',
        started_at TEXT DEFAULT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT DEFAULT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(course_id, user_id)
      );`,
      "CREATE INDEX IF NOT EXISTS idx_progress_course_id ON progress(course_id);",
      `CREATE TABLE IF NOT EXISTS wordbook_entries (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        course_id TEXT DEFAULT NULL,
        sentence_id TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        synced_at TEXT DEFAULT NULL,
        notes TEXT DEFAULT ''
      );`,
      "CREATE INDEX IF NOT EXISTS idx_wordbook_entries_word ON wordbook_entries(word);",
      `CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    version: 2,
    statements: () => loadSqlStatements(SYNC_SCHEMA_PATH),
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS auth_cache (
        cache_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        access_token TEXT NOT NULL DEFAULT '',
        access_token_expires_at TEXT DEFAULT NULL,
        refresh_token_ciphertext TEXT NOT NULL DEFAULT '',
        refresh_token_storage_mode TEXT NOT NULL DEFAULT 'none',
        refresh_token_expires_at TEXT DEFAULT NULL,
        cached_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      "CREATE INDEX IF NOT EXISTS idx_auth_cache_user_id ON auth_cache(user_id);",
    ],
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createStableId(prefix) {
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
}

function loadSqlStatements(filePath) {
  const rawSql = fs.readFileSync(filePath, "utf8");
  return rawSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

function toErrorPayload(error, fallbackMessage) {
  if (error && typeof error === "object") {
    return {
      name: String(error.name || "LocalDbError"),
      message: String(error.message || fallbackMessage || "Unknown local database error."),
      stack: typeof error.stack === "string" ? error.stack : "",
      cause: error.cause ? String(error.cause) : "",
    };
  }
  return {
    name: "LocalDbError",
    message: fallbackMessage || String(error || "Unknown local database error."),
    stack: "",
    cause: "",
  };
}

function buildLocalDbError(message, cause) {
  const error = new Error(message);
  error.name = "LocalDbError";
  if (cause) {
    error.cause = cause;
  }
  error.payload = toErrorPayload(cause || error, message);
  return error;
}

function ensurePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw buildLocalDbError(`${label} must be an object.`);
  }
  return value;
}

function ensureNonEmptyString(value, label, fallbackValue = "") {
  const next = String(value == null ? fallbackValue : value).trim();
  if (!next) {
    throw buildLocalDbError(`${label} is required.`);
  }
  return next;
}

function asNullableString(value) {
  if (value == null || value === "") {
    return null;
  }
  return String(value);
}

function asInteger(value, label, fallbackValue = 0) {
  if (value == null || value === "") {
    return fallbackValue;
  }
  const next = Number.parseInt(value, 10);
  if (!Number.isFinite(next)) {
    throw buildLocalDbError(`${label} must be a number.`);
  }
  return next;
}

function asJsonText(value, fallbackValue) {
  const source = value == null ? fallbackValue : value;
  return JSON.stringify(source);
}

function tryParseJson(value, fallbackValue) {
  if (typeof value !== "string" || !value) {
    return fallbackValue;
  }
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallbackValue;
  }
}

function normalizeCourse(input) {
  const source = ensurePlainObject(input, "course");
  const timestamp = nowIso();
  const createdAt = source.created_at ? String(source.created_at) : timestamp;
  const updatedAt = source.updated_at ? String(source.updated_at) : timestamp;
  return {
    id: ensureNonEmptyString(source.id, "course.id"),
    title: ensureNonEmptyString(source.title, "course.title"),
    source_filename: String(source.source_filename || ""),
    duration_ms: asInteger(source.duration_ms, "course.duration_ms", 0),
    runtime_kind: String(source.runtime_kind || ""),
    asr_model: String(source.asr_model || ""),
    created_at: createdAt,
    updated_at: updatedAt,
    synced_at: asNullableString(source.synced_at),
    version: asInteger(source.version, "course.version", 1),
    is_local_only: source.is_local_only === false ? 0 : 1,
    metadata_json: asJsonText(source.metadata || source.metadata_json || {}, {}),
  };
}

function normalizeSentence(courseId, input, index) {
  const source = ensurePlainObject(input, `sentences[${index}]`);
  const timestamp = nowIso();
  return {
    id: ensureNonEmptyString(source.id || `${courseId}:${index}`, `sentences[${index}].id`),
    course_id: courseId,
    sentence_index: asInteger(
      source.sentence_index == null ? index : source.sentence_index,
      `sentences[${index}].sentence_index`,
      index,
    ),
    english_text: String(source.english_text || ""),
    chinese_text: String(source.chinese_text || ""),
    start_ms: asInteger(source.start_ms, `sentences[${index}].start_ms`, 0),
    end_ms: asInteger(source.end_ms, `sentences[${index}].end_ms`, 0),
    words_json: asJsonText(source.words || source.words_json || [], []),
    variant_key: String(source.variant_key || ""),
    created_at: source.created_at ? String(source.created_at) : timestamp,
    updated_at: source.updated_at ? String(source.updated_at) : timestamp,
  };
}

function normalizeProgress(courseId, input) {
  const source = ensurePlainObject(input, "progress");
  const timestamp = nowIso();
  const userId = String(source.user_id || "local-desktop-user");
  return {
    id: ensureNonEmptyString(source.id || `${courseId}:${userId}`, "progress.id"),
    course_id: courseId,
    user_id: userId,
    current_index: asInteger(source.current_index, "progress.current_index", 0),
    completed_indices_json: asJsonText(source.completed_indices || source.completed_indices_json || [], []),
    started_at: asNullableString(source.started_at),
    updated_at: source.updated_at ? String(source.updated_at) : timestamp,
    synced_at: asNullableString(source.synced_at),
    version: asInteger(source.version, "progress.version", 1),
  };
}

function normalizeWordbookEntry(input) {
  const source = ensurePlainObject(input, "wordbook entry");
  return {
    id: ensureNonEmptyString(source.id || `wordbook:${Date.now()}`, "wordbookEntry.id"),
    word: ensureNonEmptyString(source.word, "wordbookEntry.word"),
    course_id: asNullableString(source.course_id),
    sentence_id: asNullableString(source.sentence_id),
    created_at: source.created_at ? String(source.created_at) : nowIso(),
    synced_at: asNullableString(source.synced_at),
    notes: String(source.notes || ""),
  };
}

function normalizeAuthCache(input) {
  const source = ensurePlainObject(input, "auth cache");
  const timestamp = nowIso();
  return {
    cache_key: ensureNonEmptyString(source.cache_key || "default", "authCache.cache_key"),
    user_id: ensureNonEmptyString(source.user_id, "authCache.user_id"),
    email: ensureNonEmptyString(source.email, "authCache.email"),
    is_admin: source.is_admin ? 1 : 0,
    access_token: String(source.access_token || ""),
    access_token_expires_at: asNullableString(source.access_token_expires_at),
    refresh_token_ciphertext: String(source.refresh_token_ciphertext || ""),
    refresh_token_storage_mode: ensureNonEmptyString(source.refresh_token_storage_mode || "none", "authCache.refresh_token_storage_mode"),
    refresh_token_expires_at: asNullableString(source.refresh_token_expires_at),
    cached_at: source.cached_at ? String(source.cached_at) : timestamp,
    updated_at: source.updated_at ? String(source.updated_at) : timestamp,
  };
}

function mapCourseRow(row) {
  return {
    id: row.id,
    title: row.title,
    source_filename: row.source_filename || "",
    duration_ms: Number(row.duration_ms || 0),
    runtime_kind: row.runtime_kind || "",
    asr_model: row.asr_model || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at || null,
    version: Number(row.version || 1),
    is_local_only: Boolean(row.is_local_only),
    metadata: tryParseJson(row.metadata_json, {}),
  };
}

function mapSentenceRow(row) {
  return {
    id: row.id,
    course_id: row.course_id,
    sentence_index: Number(row.sentence_index || 0),
    english_text: row.english_text || "",
    chinese_text: row.chinese_text || "",
    start_ms: Number(row.start_ms || 0),
    end_ms: Number(row.end_ms || 0),
    words: tryParseJson(row.words_json, []),
    variant_key: row.variant_key || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapProgressRow(row) {
  return {
    id: row.id,
    course_id: row.course_id,
    user_id: row.user_id,
    current_index: Number(row.current_index || 0),
    completed_indices: tryParseJson(row.completed_indices_json, []),
    started_at: row.started_at || null,
    updated_at: row.updated_at,
    synced_at: row.synced_at || null,
    version: Number(row.version || 1),
  };
}

function mapWordbookRow(row) {
  return {
    id: row.id,
    word: row.word,
    course_id: row.course_id || null,
    sentence_id: row.sentence_id || null,
    created_at: row.created_at,
    synced_at: row.synced_at || null,
    notes: row.notes || "",
  };
}

function mapAuthCacheRow(row) {
  return {
    cache_key: row.cache_key,
    user_id: row.user_id,
    email: row.email,
    is_admin: Boolean(row.is_admin),
    access_token: row.access_token || "",
    access_token_expires_at: row.access_token_expires_at || null,
    refresh_token_ciphertext: row.refresh_token_ciphertext || "",
    refresh_token_storage_mode: row.refresh_token_storage_mode || "none",
    refresh_token_expires_at: row.refresh_token_expires_at || null,
    cached_at: row.cached_at,
    updated_at: row.updated_at,
  };
}

function runStatement(database, sql, params = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    while (statement.step()) {
      // Intentionally drain write statements that might produce rows.
    }
  } finally {
    statement.free();
  }
}

function queryRows(database, sql, params = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function getSingleValue(database, sql, params = [], fallbackValue = null) {
  const row = queryRows(database, sql, params)[0];
  if (!row) {
    return fallbackValue;
  }
  const values = Object.values(row);
  return values.length ? values[0] : fallbackValue;
}

function assertDatabaseHealthy(database, context) {
  if (!database || typeof database.prepare !== "function" || typeof database.export !== "function") {
    throw buildLocalDbError(`SQLite database is not ready for ${context}.`);
  }

  let statement = null;
  try {
    statement = database.prepare("SELECT 1 AS ok;");
    statement.step();
  } catch (error) {
    throw buildLocalDbError(`SQLite database health check failed before ${context}.`, error);
  } finally {
    try {
      statement?.free();
    } catch (_) {
      // Ignore secondary cleanup failures.
    }
  }
}

function exportDatabaseSnapshot(database, context) {
  assertDatabaseHealthy(database, context);
  let bytes;
  try {
    bytes = database.export();
  } catch (error) {
    throw buildLocalDbError(`Failed to export SQLite snapshot for ${context}.`, error);
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
    throw buildLocalDbError(`SQLite snapshot export returned no data for ${context}.`);
  }
  return bytes;
}

function createIndexedDbStorage(options = {}) {
  const indexedDBFactory = options.indexedDBFactory || globalThis.indexedDB;
  const databaseName = options.databaseName || DATABASE_NAME;
  const storeName = options.storeName || STORE_NAME;

  if (!indexedDBFactory || typeof indexedDBFactory.open !== "function") {
    throw buildLocalDbError("IndexedDB is unavailable in this Electron renderer context.");
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDBFactory.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(buildLocalDbError("Failed to open IndexedDB for local database persistence.", request.error));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let settled = false;

      function finishWithError(error) {
        if (settled) {
          return;
        }
        settled = true;
        reject(buildLocalDbError("IndexedDB local database transaction failed.", error));
      }

      transaction.oncomplete = () => {
        db.close();
      };
      transaction.onabort = () => {
        db.close();
        finishWithError(transaction.error || new Error("IndexedDB transaction aborted."));
      };
      transaction.onerror = () => {
        db.close();
        finishWithError(transaction.error || new Error("IndexedDB transaction error."));
      };

      Promise.resolve()
        .then(() => callback(store))
        .then((value) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        })
        .catch((error) => {
          try {
            transaction.abort();
          } catch (_) {
            // Ignore secondary abort failures.
          }
          db.close();
          finishWithError(error);
        });
    });
  }

  return {
    async loadBytes() {
      return withStore("readonly", (store) => {
        return new Promise((resolve, reject) => {
          const request = store.get(SNAPSHOT_KEY);
          request.onsuccess = () => {
            const value = request.result;
            if (!value) {
              resolve(null);
              return;
            }
            resolve(value instanceof Uint8Array ? value : new Uint8Array(value));
          };
          request.onerror = () => reject(request.error || new Error("Failed to read persisted SQLite snapshot."));
        });
      });
    },
    async saveBytes(bytes) {
      const serialized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return withStore("readwrite", (store) => {
        return new Promise((resolve, reject) => {
          const request = store.put(serialized, SNAPSHOT_KEY);
          request.onsuccess = () => resolve(undefined);
          request.onerror = () => reject(request.error || new Error("Failed to persist SQLite snapshot."));
        });
      });
    },
  };
}

function resolveSqlJsLoader() {
  try {
    return require("sql.js/dist/sql-wasm.js");
  } catch (error) {
    throw buildLocalDbError(
      "sql.js is not installed for the desktop client. Run `npm install` in desktop/ before using window.localDb.",
      error,
    );
  }
}

function resolveWasmUrl() {
  try {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    return pathToFileURL(path.resolve(wasmPath)).toString();
  } catch (error) {
    throw buildLocalDbError("Unable to resolve sql.js WebAssembly asset.", error);
  }
}

function createLocalDbBridge(options = {}) {
  const loadSqlJs = options.loadSqlJs || resolveSqlJsLoader;
  const resolveWasmAssetUrl = options.resolveWasmUrl || resolveWasmUrl;
  let initPromise = null;
  let sqlJs = null;
  let database = null;
  let lastPersistedAt = null;
  let storage = options.storage || null;
  let syncStore = null;
  let syncStorePromise = null;

  function getStorage() {
    if (!storage) {
      storage = createIndexedDbStorage(options);
    }
    return storage;
  }

  async function persistDatabase() {
    if (!database) {
      return;
    }
    const snapshot = exportDatabaseSnapshot(database, "IndexedDB persistence");
    await getStorage().saveBytes(snapshot);
    lastPersistedAt = nowIso();
  }

  async function getSyncStore() {
    await ensureInitialized();
    if (syncStore) {
      return syncStore;
    }
    if (!syncStorePromise) {
      syncStorePromise = import(SYNC_JOURNAL_MODULE_URL)
        .then(({ createSyncJournalStore }) => {
          syncStore = createSyncJournalStore({
            getDatabase: () => database,
            runStatement,
            queryRows,
            persistDatabase,
            nowIso,
            createId: createStableId,
          });
          return syncStore;
        })
        .catch((error) => {
          syncStorePromise = null;
          throw buildLocalDbError("Failed to load sync journal helpers.", error);
        });
    }
    return syncStorePromise;
  }

  async function migrateDatabase() {
    const version = Number(getSingleValue(database, "PRAGMA user_version;", [], 0) || 0);
    for (const migration of MIGRATIONS) {
      if (migration.version <= version) {
        continue;
      }
      const statements =
        typeof migration.statements === "function" ? migration.statements() : migration.statements;
      runStatement(database, "BEGIN;");
      try {
        for (const sql of statements) {
          runStatement(database, sql);
        }
        runStatement(database, `PRAGMA user_version = ${migration.version};`);
        runStatement(
          database,
          `INSERT INTO sync_meta (key, value_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`,
          ["schema_version", JSON.stringify({ version: migration.version }), nowIso()],
        );
        runStatement(database, "COMMIT;");
      } catch (error) {
        runStatement(database, "ROLLBACK;");
        throw buildLocalDbError(`Failed to apply local database migration v${migration.version}.`, error);
      }
    }
    if (version < SCHEMA_VERSION) {
      await persistDatabase();
    }
  }

  async function ensureInitialized() {
    if (database) {
      return api;
    }
    if (!initPromise) {
      initPromise = (async () => {
        const initSqlJs = loadSqlJs();
        sqlJs = await initSqlJs({
          locateFile: () => resolveWasmAssetUrl(),
        });
        const persisted = await getStorage().loadBytes();
        database = persisted ? new sqlJs.Database(persisted) : new sqlJs.Database();
        assertDatabaseHealthy(database, "initialization");
        await migrateDatabase();
        return api;
      })().catch((error) => {
        initPromise = null;
        database = null;
        throw buildLocalDbError(
          `Failed to initialize the desktop local database: ${error?.message || "Unknown error"}`,
          error,
        );
      });
    }
    return initPromise;
  }

  async function execute(label, handler) {
    try {
      await ensureInitialized();
      return await handler();
    } catch (error) {
      throw buildLocalDbError(`window.localDb.${label} failed: ${error.message || "Unknown error"}`, error);
    }
  }

  const api = {
    async init() {
      return execute("init", async () => ({
        ready: true,
        schemaVersion: Number(getSingleValue(database, "PRAGMA user_version;", [], SCHEMA_VERSION) || SCHEMA_VERSION),
        persistedAt: lastPersistedAt,
      }));
    },

    async getCourses() {
      return execute("getCourses", async () => {
        return queryRows(
          database,
          `SELECT id, title, source_filename, duration_ms, runtime_kind, asr_model, created_at, updated_at,
                  synced_at, version, is_local_only, metadata_json
             FROM courses
         ORDER BY datetime(created_at) DESC, id DESC;`,
        ).map(mapCourseRow);
      });
    },

    async saveCourse(course, options = {}) {
      return execute("saveCourse", async () => {
        const initial = normalizeCourse(course);
        const existing = queryRows(
          database,
          `SELECT id, created_at, version
             FROM courses
            WHERE id = ?
            LIMIT 1;`,
          [initial.id],
        )[0];
        const normalized = {
          ...initial,
          created_at: existing?.created_at || initial.created_at,
          version: existing ? Number(existing.version || 0) + 1 : Math.max(1, Number(initial.version || 1)),
        };
        const operation = existing ? "UPDATE" : "INSERT";
        const sync = await getSyncStore();
        const syncBehavior = String(options.syncBehavior || "local").trim().toLowerCase() || "local";

        runStatement(database, "BEGIN;");
        try {
          runStatement(
            database,
            `INSERT INTO courses (
               id, title, source_filename, duration_ms, runtime_kind, asr_model,
               created_at, updated_at, synced_at, version, is_local_only, metadata_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               source_filename = excluded.source_filename,
               duration_ms = excluded.duration_ms,
               runtime_kind = excluded.runtime_kind,
               asr_model = excluded.asr_model,
               updated_at = excluded.updated_at,
               synced_at = excluded.synced_at,
               version = excluded.version,
               is_local_only = excluded.is_local_only,
               metadata_json = excluded.metadata_json;`,
            [
              normalized.id,
              normalized.title,
              normalized.source_filename,
              normalized.duration_ms,
              normalized.runtime_kind,
              normalized.asr_model,
              normalized.created_at,
              normalized.updated_at,
              normalized.synced_at,
              normalized.version,
              normalized.is_local_only,
              normalized.metadata_json,
            ],
          );
          if (syncBehavior === "local") {
            await sync.logSync("courses", normalized.id, operation, normalized.version, {
              persist: false,
              localUpdatedAt: normalized.updated_at,
              syncedAt: normalized.synced_at,
            });
          }
          runStatement(database, "COMMIT;");
        } catch (error) {
          runStatement(database, "ROLLBACK;");
          throw error;
        }
        await persistDatabase();
        return mapCourseRow(normalized);
      });
    },

    async deleteCourse(id, options = {}) {
      return execute("deleteCourse", async () => {
        const courseId = ensureNonEmptyString(id, "course id");
        const existing = queryRows(
          database,
          `SELECT id, version, updated_at, synced_at
             FROM courses
            WHERE id = ?
            LIMIT 1;`,
          [courseId],
        )[0];
        const syncBehavior = String(options.syncBehavior || "local").trim().toLowerCase() || "local";
        const sync = await getSyncStore();
        const deleteVersion = existing ? Math.max(1, Number(existing.version || 0) + 1) : 1;
        const deletedAt = nowIso();

        runStatement(database, "BEGIN;");
        try {
          runStatement(database, "DELETE FROM lesson_sentences WHERE course_id = ?;", [courseId]);
          runStatement(database, "DELETE FROM progress WHERE course_id = ?;", [courseId]);
          runStatement(database, "DELETE FROM courses WHERE id = ?;", [courseId]);
          if (syncBehavior === "local" && existing) {
            await sync.logSync("courses", courseId, "DELETE", deleteVersion, {
              persist: false,
              localUpdatedAt: deletedAt,
              syncedAt: existing.synced_at || null,
            });
          }
          runStatement(database, "COMMIT;");
        } catch (error) {
          runStatement(database, "ROLLBACK;");
          throw error;
        }
        await persistDatabase();
        return { deleted: true, id: courseId };
      });
    },

    async getSentences(courseId) {
      return execute("getSentences", async () => {
        const normalizedCourseId = ensureNonEmptyString(courseId, "courseId");
        return queryRows(
          database,
          `SELECT id, course_id, sentence_index, english_text, chinese_text, start_ms, end_ms,
                  words_json, variant_key, created_at, updated_at
             FROM lesson_sentences
            WHERE course_id = ?
         ORDER BY sentence_index ASC, id ASC;`,
          [normalizedCourseId],
        ).map(mapSentenceRow);
      });
    },

    async saveSentences(courseId, sentences) {
      return execute("saveSentences", async () => {
        const normalizedCourseId = ensureNonEmptyString(courseId, "courseId");
        if (!Array.isArray(sentences)) {
          throw buildLocalDbError("sentences must be an array.");
        }
        const normalized = sentences.map((sentence, index) => normalizeSentence(normalizedCourseId, sentence, index));
        runStatement(database, "BEGIN;");
        try {
          runStatement(database, "DELETE FROM lesson_sentences WHERE course_id = ?;", [normalizedCourseId]);
          for (const sentence of normalized) {
            runStatement(
              database,
              `INSERT INTO lesson_sentences (
                 id, course_id, sentence_index, english_text, chinese_text, start_ms, end_ms,
                 words_json, variant_key, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                sentence.id,
                sentence.course_id,
                sentence.sentence_index,
                sentence.english_text,
                sentence.chinese_text,
                sentence.start_ms,
                sentence.end_ms,
                sentence.words_json,
                sentence.variant_key,
                sentence.created_at,
                sentence.updated_at,
              ],
            );
          }
          runStatement(database, "COMMIT;");
        } catch (error) {
          runStatement(database, "ROLLBACK;");
          throw error;
        }
        await persistDatabase();
        return normalized.map(mapSentenceRow);
      });
    },

    async getProgress(courseId) {
      return execute("getProgress", async () => {
        const normalizedCourseId = ensureNonEmptyString(courseId, "courseId");
        const row = queryRows(
          database,
          `SELECT id, course_id, user_id, current_index, completed_indices_json, started_at,
                  updated_at, synced_at, version
             FROM progress
            WHERE course_id = ?
         ORDER BY updated_at DESC, id DESC
            LIMIT 1;`,
          [normalizedCourseId],
        )[0];
        return row ? mapProgressRow(row) : null;
      });
    },

    async saveProgress(courseId, progress, options = {}) {
      return execute("saveProgress", async () => {
        const normalizedCourseId = ensureNonEmptyString(courseId, "courseId");
        const initial = normalizeProgress(normalizedCourseId, progress);
        const existing = queryRows(
          database,
          `SELECT id, version
             FROM progress
            WHERE course_id = ?
              AND user_id = ?
            LIMIT 1;`,
          [normalizedCourseId, initial.user_id],
        )[0];
        const normalized = {
          ...initial,
          id: existing?.id || initial.id,
          version: existing ? Number(existing.version || 0) + 1 : Math.max(1, Number(initial.version || 1)),
        };
        const operation = existing ? "UPDATE" : "INSERT";
        const sync = await getSyncStore();
        const syncBehavior = String(options.syncBehavior || "local").trim().toLowerCase() || "local";
        runStatement(database, "BEGIN;");
        try {
          runStatement(
            database,
            `INSERT INTO progress (
               id, course_id, user_id, current_index, completed_indices_json, started_at,
               updated_at, synced_at, version
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               current_index = excluded.current_index,
               completed_indices_json = excluded.completed_indices_json,
               started_at = excluded.started_at,
               updated_at = excluded.updated_at,
               synced_at = excluded.synced_at,
               version = excluded.version;`,
            [
              normalized.id,
              normalized.course_id,
              normalized.user_id,
              normalized.current_index,
              normalized.completed_indices_json,
              normalized.started_at,
              normalized.updated_at,
              normalized.synced_at,
              normalized.version,
            ],
          );
          if (syncBehavior === "local") {
            await sync.logSync("progress", normalized.id, operation, normalized.version, {
              persist: false,
              localUpdatedAt: normalized.updated_at,
              syncedAt: normalized.synced_at,
            });
          }
          runStatement(database, "COMMIT;");
        } catch (error) {
          runStatement(database, "ROLLBACK;");
          throw error;
        }
        await persistDatabase();
        return mapProgressRow(normalized);
      });
    },

    async getWordbook() {
      return execute("getWordbook", async () => {
        return queryRows(
          database,
          `SELECT id, word, course_id, sentence_id, created_at, synced_at, notes
             FROM wordbook_entries
         ORDER BY datetime(created_at) DESC, id DESC;`,
        ).map(mapWordbookRow);
      });
    },

    async saveWordbookEntry(entry) {
      return execute("saveWordbookEntry", async () => {
        const normalized = normalizeWordbookEntry(entry);
        runStatement(
          database,
          `INSERT INTO wordbook_entries (
             id, word, course_id, sentence_id, created_at, synced_at, notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             word = excluded.word,
             course_id = excluded.course_id,
             sentence_id = excluded.sentence_id,
             synced_at = excluded.synced_at,
             notes = excluded.notes;`,
          [
            normalized.id,
            normalized.word,
            normalized.course_id,
            normalized.sentence_id,
            normalized.created_at,
            normalized.synced_at,
            normalized.notes,
          ],
        );
        await persistDatabase();
        return mapWordbookRow(normalized);
      });
    },

    async deleteWordbookEntry(id) {
      return execute("deleteWordbookEntry", async () => {
        const entryId = ensureNonEmptyString(id, "wordbook entry id");
        runStatement(database, "DELETE FROM wordbook_entries WHERE id = ?;", [entryId]);
        await persistDatabase();
        return { deleted: true, id: entryId };
      });
    },

    async getAuthCache(cacheKey = "default") {
      return execute("getAuthCache", async () => {
        const normalizedCacheKey = ensureNonEmptyString(cacheKey, "auth cache key", "default");
        const row = queryRows(
          database,
          `SELECT cache_key, user_id, email, is_admin, access_token, access_token_expires_at,
                  refresh_token_ciphertext, refresh_token_storage_mode, refresh_token_expires_at,
                  cached_at, updated_at
             FROM auth_cache
            WHERE cache_key = ?
            LIMIT 1;`,
          [normalizedCacheKey],
        )[0];
        return row ? mapAuthCacheRow(row) : null;
      });
    },

    async saveAuthCache(authCache) {
      return execute("saveAuthCache", async () => {
        const normalized = normalizeAuthCache(authCache);
        runStatement(
          database,
          `INSERT INTO auth_cache (
             cache_key, user_id, email, is_admin, access_token, access_token_expires_at,
             refresh_token_ciphertext, refresh_token_storage_mode, refresh_token_expires_at,
             cached_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             user_id = excluded.user_id,
             email = excluded.email,
             is_admin = excluded.is_admin,
             access_token = excluded.access_token,
             access_token_expires_at = excluded.access_token_expires_at,
             refresh_token_ciphertext = excluded.refresh_token_ciphertext,
             refresh_token_storage_mode = excluded.refresh_token_storage_mode,
             refresh_token_expires_at = excluded.refresh_token_expires_at,
             cached_at = excluded.cached_at,
             updated_at = excluded.updated_at;`,
          [
            normalized.cache_key,
            normalized.user_id,
            normalized.email,
            normalized.is_admin,
            normalized.access_token,
            normalized.access_token_expires_at,
            normalized.refresh_token_ciphertext,
            normalized.refresh_token_storage_mode,
            normalized.refresh_token_expires_at,
            normalized.cached_at,
            normalized.updated_at,
          ],
        );
        await persistDatabase();
        return mapAuthCacheRow(normalized);
      });
    },

    async clearAuthCache(cacheKey = "default") {
      return execute("clearAuthCache", async () => {
        const normalizedCacheKey = ensureNonEmptyString(cacheKey, "auth cache key", "default");
        runStatement(database, "DELETE FROM auth_cache WHERE cache_key = ?;", [normalizedCacheKey]);
        await persistDatabase();
        return { deleted: true, cache_key: normalizedCacheKey };
      });
    },

    sync: {
      async getMeta(key) {
        const normalizedKey = ensureNonEmptyString(key, "sync meta key");
        return execute("sync.getMeta", async () => {
          const row = queryRows(
            database,
            `SELECT key, value_json, updated_at
               FROM sync_meta
              WHERE key = ?
              LIMIT 1;`,
            [normalizedKey],
          )[0];
          if (!row) {
            return null;
          }
          return {
            key: row.key,
            value: tryParseJson(row.value_json, {}),
            updated_at: row.updated_at,
          };
        });
      },

      async setMeta(key, value) {
        const normalizedKey = ensureNonEmptyString(key, "sync meta key");
        return execute("sync.setMeta", async () => {
          const updatedAt = nowIso();
          runStatement(
            database,
            `INSERT INTO sync_meta (key, value_json, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at;`,
            [normalizedKey, asJsonText(value, {}), updatedAt],
          );
          await persistDatabase();
          return {
            key: normalizedKey,
            value: value == null ? {} : value,
            updated_at: updatedAt,
          };
        });
      },

      async logSync(tableName, recordId, operation, version) {
        const sync = await getSyncStore();
        return sync.logSync(tableName, recordId, operation, version);
      },

      async saveConflict(conflict) {
        const sync = await getSyncStore();
        return sync.saveConflict(conflict);
      },

      async getUnresolvedConflicts() {
        const sync = await getSyncStore();
        return sync.getUnresolvedConflicts();
      },

      async resolveConflict(conflictId, resolution) {
        const sync = await getSyncStore();
        return sync.resolveConflict(conflictId, resolution);
      },

      async getPendingRecords(tableName) {
        const sync = await getSyncStore();
        return sync.getPendingRecords(tableName);
      },

      async markSynced(ids) {
        const sync = await getSyncStore();
        return sync.markSynced(ids);
      },
    },
  };

  return api;
}

module.exports = {
  createIndexedDbStorage,
  createLocalDbBridge,
  errors: {
    buildLocalDbError,
    toErrorPayload,
  },
};
