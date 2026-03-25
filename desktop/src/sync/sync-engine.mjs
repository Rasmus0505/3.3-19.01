export class SyncStatus {
  static IDLE = "idle";
  static SYNCING = "syncing";
  static SYNCED = "synced";
  static ERROR = "error";
  static OFFLINE = "offline";
}

export class ConflictStrategy {
  static LOCAL = "local";
  static REMOTE = "remote";
  static MERGE = "merge";
}

function nowIso() {
  return new Date().toISOString();
}

function tryParseJson(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function buildCloudApiClient(desktopRuntime) {
  async function getAccessToken() {
    const token = await desktopRuntime.auth.getAccessToken({ online: true });
    if (!token) {
      throw new Error("No active cloud session for sync.");
    }
    return token;
  }

  async function request(path, options = {}) {
    const token = await getAccessToken();
    const response = await fetch(`${await _resolveCloudBase()}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { message: text };
    }
    if (!response.ok) {
      const message =
        (data?.detail && typeof data.detail === "object"
          ? data.detail.message || data.detail.detail
          : data?.message || data?.detail) || `Cloud API ${response.status} failed`;
      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  let _basePromise = null;
  async function _resolveCloudBase() {
    if (_basePromise) return _basePromise;
    _basePromise = (async () => {
      const info = await desktopRuntime.getRuntimeInfo();
      const base =
        info?.cloud?.apiBaseUrl || info?.cloud?.appBaseUrl || "";
      return base.replace(/\/+$/, "");
    })();
    return _basePromise;
  }

  return {
    async getCourses(since = null) {
      const params = since ? `?since=${encodeURIComponent(since)}` : "";
      return request(`/api/lessons${params}`);
    },

    async getCourse(courseId) {
      return request(`/api/lessons/${courseId}`);
    },

    async createCourse(courseData) {
      return request("/api/lessons/local-asr/complete", {
        method: "POST",
        body: JSON.stringify({
          source_filename: courseData.source_filename || "",
          source_duration_ms: Number(courseData.duration_ms || 0),
          runtime_kind: courseData.runtime_kind || "desktop_local",
          asr_payload: courseData.metadata?.asr_payload || {},
          asr_model: courseData.asr_model || "faster-whisper-medium",
        }),
      });
    },

    async updateCourseTitle(courseId, title) {
      return request(`/api/lessons/${courseId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    },

    async deleteCourse(courseId) {
      return request(`/api/lessons/${courseId}`, {
        method: "DELETE",
      });
    },

    async getProgress(courseId) {
      return request(`/api/lessons/${courseId}/progress`);
    },

    async saveProgress(courseId, progressData) {
      return request(`/api/lessons/${courseId}/progress`, {
        method: "PUT",
        body: JSON.stringify({
          current_sentence_idx: Number(progressData.current_index || 0),
          completed_indexes: progressData.completed_indices || [],
        }),
      });
    },

    async getWordbook() {
      return request("/api/wordbook");
    },

    async addWordbookEntry(entry) {
      return request("/api/wordbook/collect", {
        method: "POST",
        body: JSON.stringify({
          lesson_id: entry.course_id ? Number(entry.course_id) : null,
          sentence_index: 0,
          entry_type: "word",
          entry_text: entry.word,
        }),
      });
    },

    async invalidateCache() {
      _basePromise = null;
    },
  };
}

export class SyncEngine {
  #localDb;
  #cloud;
  #desktopRuntime;
  #syncMeta = {
    lastSyncAt: null,
    status: SyncStatus.IDLE,
    syncingTables: [],
    error: null,
    totalItems: 0,
    completedItems: 0,
  };
  #listeners = new Map();
  #syncInProgress = false;
  #pendingAutoSync = false;
  #onlineUnsubscribe = null;
  #offlineUnsubscribe = null;

  constructor({ localDb, desktopRuntime }) {
    if (!localDb) throw new Error("SyncEngine requires localDb bridge.");
    if (!desktopRuntime) throw new Error("SyncEngine requires desktopRuntime bridge.");
    this.#localDb = localDb;
    this.#desktopRuntime = desktopRuntime;
    this.#cloud = buildCloudApiClient(desktopRuntime);
    this.#setupOnlineListeners();
  }

  #emit(event, data) {
    for (const cb of this.#listeners.values()) {
      try {
        cb(event, data);
      } catch (_) {}
    }
  }

  #notify(state) {
    this.#syncMeta = { ...this.#syncMeta, ...state };
    this.#emit("syncStateChanged", { ...this.#syncMeta });
  }

  async #getMeta(key) {
    try {
      const meta = await this.#localDb.sync.getMeta(key);
      return meta?.value ?? null;
    } catch (_) {
      return null;
    }
  }

  async #setMeta(key, value) {
    try {
      await this.#localDb.sync.setMeta(key, value);
    } catch (_) {}
  }

  #setupOnlineListeners() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", this.#handleOnline.bind(this));
    window.addEventListener("offline", this.#handleOffline.bind(this));
  }

  #handleOnline() {
    if (this.#syncInProgress) {
      this.#pendingAutoSync = true;
      return;
    }
    this.#pendingAutoSync = false;
    this.#emit("online", {});
  }

  #handleOffline() {
    this.#notify({ status: SyncStatus.OFFLINE, error: null });
    this.#emit("offline", {});
  }

  async #getLocalIdMapping() {
    return (await this.#getMeta("localIdMapping")) || {};
  }

  async #saveLocalIdMapping(mapping) {
    await this.#setMeta("localIdMapping", mapping);
  }

  async #getCourseMapping() {
    return (await this.#getMeta("courseMapping")) || {};
  }

  async #saveCourseMapping(mapping) {
    await this.#setMeta("courseMapping", mapping);
  }

  async #markJournalSynced(journalId) {
    if (!journalId) return;
    await this.#localDb.sync.markSynced([journalId]);
  }

  #pushLocalCourses(pending, courseMapping) {
    const localOnly = pending.filter((j) => {
      const course = this.#getLocalCourseById(j.record_id);
      return course?.is_local_only;
    });
    return localOnly;
  }

  #getLocalCourseById(id) {
    return null;
  }

  async syncCourses(options = {}) {
    const tableName = "courses";
    this.#notify({
      status: SyncStatus.SYNCING,
      syncingTables: [tableName],
      totalItems: 0,
      completedItems: 0,
      error: null,
    });

    try {
      const lastSyncAt = await this.#getMeta("lastCoursesSyncAt");
      let remoteUpdated = false;

      if (navigator.onLine) {
        try {
          const remoteCourses = await this.#cloud.getCourses(lastSyncAt);
          const remoteList = Array.isArray(remoteCourses) ? remoteCourses : (remoteCourses.items || []);
          const courseMapping = await this.#getCourseMapping();
          const localIdMapping = await this.#getLocalIdMapping();

          for (const remote of remoteList) {
            const localId = courseMapping[remote.id];
            const localCourse = localId
              ? await this.#localDb.getCourses().then((cs) => cs.find((c) => c.id === localId))
              : null;

            if (localCourse) {
              const localUpdatedAt = new Date(localCourse.updated_at || 0).getTime();
              const remoteUpdatedAt = new Date(remote.updated_at || 0).getTime();

              if (remoteUpdatedAt > localUpdatedAt) {
                if (localCourse.updated_at !== localCourse.synced_at) {
                  await this.#localDb.sync.saveConflict({
                    tableName: tableName,
                    recordId: localCourse.id,
                    localData: localCourse,
                    remoteData: remote,
                  });
                  this.#emit("conflict", {
                    tableName,
                    recordId: localCourse.id,
                    local: localCourse,
                    remote,
                  });
                } else {
                  await this.#localDb.saveCourse(
                    {
                      ...localCourse,
                      ...remote,
                      synced_at: nowIso(),
                    },
                    { syncBehavior: "none" },
                  );
                  remoteUpdated = true;
                }
              }
            } else {
              const courseMapping2 = await this.#getCourseMapping();
              courseMapping2[remote.id] = remote.id;
              await this.#saveCourseMapping(courseMapping2);

              await this.#localDb.saveCourse(
                {
                  id: String(remote.id),
                  title: remote.title || "",
                  source_filename: remote.source_filename || "",
                  duration_ms: remote.duration_ms || 0,
                  runtime_kind: remote.runtime_kind || "",
                  asr_model: remote.asr_model || "",
                  created_at: remote.created_at || nowIso(),
                  updated_at: remote.updated_at || nowIso(),
                  synced_at: nowIso(),
                  version: remote.version || 1,
                  is_local_only: false,
                  metadata: {},
                },
                { syncBehavior: "none" },
              );
              remoteUpdated = true;
            }
          }
        } catch (err) {
          console.warn("[SyncEngine] Failed to pull remote courses:", err?.message);
        }

        try {
          const pending = await this.#localDb.sync.getPendingRecords(tableName);
          const courseMapping = await this.#getCourseMapping();
          const localIdMapping = await this.#getLocalIdMapping();

          for (const journal of pending) {
            const courseMapping2 = await this.#getCourseMapping();
            const cloudId = courseMapping2[journal.record_id];
            let pushed = false;
            if (cloudId) {
              if (journal.operation === "DELETE") {
                await this.#cloud.deleteCourse(cloudId);
                delete courseMapping2[journal.record_id];
                await this.#saveCourseMapping(courseMapping2);
                remoteUpdated = true;
                pushed = true;
              } else {
                const courses = await this.#localDb.getCourses();
                const course = courses.find((c) => c.id === journal.record_id);
                if (course) {
                  if (!course.is_local_only) {
                    await this.#cloud.updateCourseTitle(cloudId, course.title);
                  }
                  remoteUpdated = true;
                  pushed = true;
                }
              }
            } else {
              const courses = await this.#localDb.getCourses();
              const course = courses.find((c) => c.id === journal.record_id);
              if (course && course.is_local_only) {
                try {
                  const cloudResult = await this.#cloud.createCourse({
                    source_filename: course.source_filename || "",
                    duration_ms: course.duration_ms || 0,
                    runtime_kind: course.runtime_kind || "desktop_local",
                    metadata: course.metadata || {},
                    asr_model: course.asr_model || "faster-whisper-medium",
                  });

                  if (cloudResult?.lesson?.id) {
                    const mapping = await this.#getCourseMapping();
                    mapping[journal.record_id] = String(cloudResult.lesson.id);
                    await this.#saveCourseMapping(mapping);

                    await this.#localDb.saveCourse(
                      {
                        ...course,
                        is_local_only: false,
                        synced_at: nowIso(),
                      },
                      { syncBehavior: "none" },
                    );
                    remoteUpdated = true;
                    pushed = true;
                  }
                } catch (err) {
                  console.warn("[SyncEngine] Failed to push local course:", err?.message);
                }
              }
            }

            if (pushed) {
              await this.#markJournalSynced(journal.id);
            }

            this.#notify({
              completedItems: this.#syncMeta.completedItems + 1,
            });
          }
        } catch (err) {
          console.warn("[SyncEngine] Failed to push local courses:", err?.message);
        }
      }

      const syncTs = nowIso();
      await this.#setMeta("lastCoursesSyncAt", syncTs);
      await this.#setMeta("lastSyncAt", syncTs);

      this.#notify({
        status: SyncStatus.SYNCED,
        syncingTables: [],
        completedItems: this.#syncMeta.totalItems,
        lastSyncAt: syncTs,
        error: null,
      });

      if (remoteUpdated) {
        this.#emit("remoteUpdated", { tableName });
      }

      return { ok: true, remoteUpdated, lastSyncAt: syncTs };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error || "Unknown sync error");
      this.#notify({
        status: SyncStatus.ERROR,
        error: errMsg,
        syncingTables: [],
      });
      this.#emit("syncError", { tableName, error: errMsg });
      return { ok: false, error: errMsg };
    }
  }

  async syncProgress(options = {}) {
    const tableName = "progress";
    this.#notify({
      status: SyncStatus.SYNCING,
      syncingTables: [tableName],
      totalItems: 0,
      completedItems: 0,
      error: null,
    });

    try {
      if (!navigator.onLine) {
        this.#notify({ status: SyncStatus.OFFLINE, syncingTables: [] });
        return { ok: false, error: "Offline" };
      }

      const courseMapping = await this.#getCourseMapping();
      const pending = await this.#localDb.sync.getPendingRecords(tableName);

      for (const journal of pending) {
        const localCourseId = journal.record_id.replace(/:[^:]+$/, "");
        const cloudCourseId = courseMapping[localCourseId];
        if (!cloudCourseId) continue;

        const progress = await this.#localDb.getProgress(localCourseId);
        if (!progress) continue;

        try {
          await this.#cloud.saveProgress(cloudCourseId, {
            current_index: progress.current_index,
            completed_indices: progress.completed_indices || [],
          });
          await this.#markJournalSynced(journal.id);
        } catch (err) {
          console.warn("[SyncEngine] Failed to sync progress:", err?.message);
        }
      }

      const syncTs = nowIso();
      await this.#setMeta("lastProgressSyncAt", syncTs);
      await this.#setMeta("lastSyncAt", syncTs);

      this.#notify({
        status: SyncStatus.SYNCED,
        syncingTables: [],
        completedItems: this.#syncMeta.totalItems,
        lastSyncAt: syncTs,
        error: null,
      });

      return { ok: true, lastSyncAt: syncTs };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error || "Unknown sync error");
      this.#notify({
        status: SyncStatus.ERROR,
        error: errMsg,
        syncingTables: [],
      });
      return { ok: false, error: errMsg };
    }
  }

  async syncWordbook(options = {}) {
    const tableName = "wordbook";
    this.#notify({
      status: SyncStatus.SYNCING,
      syncingTables: [tableName],
      totalItems: 0,
      completedItems: 0,
      error: null,
    });

    try {
      if (!navigator.onLine) {
        this.#notify({ status: SyncStatus.OFFLINE, syncingTables: [] });
        return { ok: false, error: "Offline" };
      }

      try {
        const remoteWordbook = await this.#cloud.getWordbook();
        const remoteWords = Array.isArray(remoteWordbook) ? remoteWordbook : (remoteWordbook.items || []);

        for (const remote of remoteWords) {
          try {
            await this.#localDb.saveWordbookEntry({
              id: `cloud:${remote.id}`,
              word: remote.word,
              course_id: remote.course_id ? String(remote.course_id) : null,
              sentence_id: remote.sentence_id || null,
              created_at: remote.created_at || nowIso(),
              synced_at: nowIso(),
              notes: remote.notes || "",
            });
          } catch (_) {}
        }
      } catch (err) {
        console.warn("[SyncEngine] Failed to pull wordbook:", err?.message);
      }

      const localEntries = await this.#localDb.getWordbook();
      const unsynced = localEntries.filter((e) => !e.synced_at);

      for (const entry of unsynced) {
        try {
          await this.#cloud.addWordbookEntry(entry);
          await this.#localDb.saveWordbookEntry({
            ...entry,
            synced_at: nowIso(),
          });
        } catch (_) {}
      }

      const syncTs = nowIso();
      await this.#setMeta("lastWordbookSyncAt", syncTs);
      await this.#setMeta("lastSyncAt", syncTs);

      this.#notify({
        status: SyncStatus.SYNCED,
        syncingTables: [],
        completedItems: this.#syncMeta.totalItems,
        lastSyncAt: syncTs,
        error: null,
      });

      return { ok: true, lastSyncAt: syncTs };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error || "Unknown sync error");
      this.#notify({
        status: SyncStatus.ERROR,
        error: errMsg,
        syncingTables: [],
      });
      return { ok: false, error: errMsg };
    }
  }

  async resolveConflict(conflictId, strategy = ConflictStrategy.LOCAL) {
    if (!["local", "remote", "merge"].includes(strategy)) {
      throw new Error(`Invalid conflict resolution strategy: ${strategy}`);
    }

    const conflicts = await this.#localDb.sync.getUnresolvedConflicts();
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) {
      return { resolved: false, id: conflictId, error: "Conflict not found" };
    }

    const tableName = conflict.table_name;
    const recordId = conflict.record_id;
    const localData = conflict.local_data;
    const remoteData = conflict.remote_data;

    try {
      if (strategy === ConflictStrategy.REMOTE) {
        if (tableName === "courses") {
          await this.#localDb.saveCourse(
            {
              ...(remoteData || {}),
              synced_at: nowIso(),
            },
            { syncBehavior: "none" },
          );
        }
      } else if (strategy === ConflictStrategy.LOCAL) {
        if (tableName === "courses" && localData) {
          const courseMapping = await this.#getCourseMapping();
          const cloudId = courseMapping[recordId];
          if (cloudId) {
            try {
              await this.#cloud.updateCourseTitle(cloudId, localData.title || "");
            } catch (_) {}
          }
        }
      } else if (strategy === ConflictStrategy.MERGE) {
        if (tableName === "courses") {
          const merged = {
            ...(remoteData || {}),
            ...(localData || {}),
            title: (localData?.title || remoteData?.title || "").trim() || remoteData?.title || localData?.title,
            synced_at: nowIso(),
          };
          await this.#localDb.saveCourse(merged, { syncBehavior: "none" });
        }
      }

      const result = await this.#localDb.sync.resolveConflict(conflictId, strategy);
      this.#emit("conflictResolved", {
        conflictId,
        tableName,
        recordId,
        strategy,
      });
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { resolved: false, id: conflictId, error: errMsg };
    }
  }

  async autoSync(options = {}) {
    if (this.#syncInProgress) {
      return { ok: false, error: "Sync already in progress" };
    }
    return this.syncAll(options);
  }

  async syncAll(options = {}) {
    this.#syncInProgress = true;
    try {
      this.#notify({
        status: SyncStatus.SYNCING,
        syncingTables: [],
        totalItems: 0,
        completedItems: 0,
        error: null,
      });

      const results = {
        courses: null,
        progress: null,
        wordbook: null,
      };

      if (options.courses !== false) {
        results.courses = await this.syncCourses(options);
      }
      if (options.progress !== false) {
        results.progress = await this.syncProgress(options);
      }
      if (options.wordbook !== false) {
        results.wordbook = await this.syncWordbook(options);
      }

      const lastSyncAt = nowIso();
      await this.#setMeta("lastSyncAt", lastSyncAt);

      this.#notify({
        status: SyncStatus.SYNCED,
        syncingTables: [],
        completedItems: this.#syncMeta.totalItems,
        lastSyncAt,
        error: null,
      });

      if (this.#pendingAutoSync) {
        this.#pendingAutoSync = false;
        setTimeout(() => this.#emit("online", {}), 100);
      }

      return { ok: true, results, lastSyncAt };
    } finally {
      this.#syncInProgress = false;
    }
  }

  on(event, callback) {
    const id = Math.random().toString(36).slice(2);
    this.#listeners.set(id, callback);
    return () => this.#listeners.delete(id);
  }

  async getStatus() {
    return { ...this.#syncMeta };
  }

  async getConflicts() {
    return this.#localDb.sync.getUnresolvedConflicts();
  }

  async getPendingCounts() {
    const [courses, progress] = await Promise.all([
      this.#localDb.sync.getPendingRecords("courses"),
      this.#localDb.sync.getPendingRecords("progress"),
    ]);
    return {
      courses: courses.length,
      progress: progress.length,
    };
  }

  async getLastSyncTime() {
    return (await this.#getMeta("lastSyncAt")) || null;
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.#handleOnline.bind(this));
      window.removeEventListener("offline", this.#handleOffline.bind(this));
    }
    this.#listeners.clear();
    this.#cloud.invalidateCache();
  }
}
