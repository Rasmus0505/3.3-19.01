const DB_NAME = "english_trainer_generation_tasks";
const DB_VERSION = 4;
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

function normalizeNonNegativeNumber(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeTimestamp(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeBlob(value) {
  if (typeof Blob === "undefined") {
    return null;
  }
  return value instanceof Blob ? value : null;
}

function buildScopedActiveKey(ownerUserId) {
  const normalized = normalizeOwnerUserId(ownerUserId);
  return normalized ? `${ACTIVE_KEY_PREFIX}${normalized}` : "";
}

function buildSuccessSnapshotKey(ownerUserId) {
  const normalized = normalizeOwnerUserId(ownerUserId);
  return normalized ? `${SUCCESS_SNAPSHOT_KEY_PREFIX}${normalized}` : "";
}

function normalizeWorkspaceSource(source) {
  if (!source || typeof source !== "object") {
    return null;
  }
  return {
    source_filename: String(source.source_filename || ""),
    input_mode: String(source.input_mode || ""),
    runtime_kind: String(source.runtime_kind || ""),
    source_duration_ms: normalizeNonNegativeNumber(source.source_duration_ms),
  };
}

function normalizeWorkspaceCurrent(current) {
  if (!current || typeof current !== "object") {
    return null;
  }
  return {
    status: String(current.status || ""),
    overall_percent: normalizeNonNegativeNumber(current.overall_percent),
    current_text: String(current.current_text || ""),
    resume_stage: String(current.resume_stage || ""),
  };
}

function normalizeWorkspaceRestorePointer(pointer, workspace) {
  const candidate = pointer && typeof pointer === "object" ? pointer : {};
  return {
    task_id: String(candidate.task_id || workspace?.task_id || ""),
    lesson_id: Number(candidate.lesson_id ?? workspace?.lesson_id ?? 0) || null,
    status: String(candidate.status || workspace?.current?.status || ""),
    resume_available: Boolean(candidate.resume_available),
    resume_stage: String(candidate.resume_stage || workspace?.current?.resume_stage || ""),
  };
}

function normalizeWorkspaceSnapshot(workspace) {
  if (!workspace || typeof workspace !== "object") {
    return null;
  }
  return {
    workspace_id: String(workspace.workspace_id || workspace.id || ""),
    scope: String(workspace.scope || ""),
    owner_user_id: normalizeOwnerUserId(workspace.owner_user_id),
    task_id: String(workspace.task_id || ""),
    lesson_id: Number(workspace.lesson_id || 0) || null,
    created_at: String(workspace.created_at || ""),
    updated_at: String(workspace.updated_at || ""),
    source: normalizeWorkspaceSource(workspace.source),
    current: normalizeWorkspaceCurrent(workspace.current),
    restore_pointer: normalizeWorkspaceRestorePointer(workspace.restore_pointer || workspace.restorePointer, workspace),
  };
}

function normalizeTaskSnapshot(taskSnapshot) {
  if (!taskSnapshot || typeof taskSnapshot !== "object") {
    return null;
  }
  const normalizeLessonId = (value) => {
    const rawValue = typeof value === "number" ? value : String(value ?? "").trim();
    if (typeof rawValue === "number") {
      return Number.isInteger(rawValue) && rawValue > 0 ? rawValue : null;
    }
    if (!rawValue) {
      return null;
    }
    const parsed = Number(rawValue);
    if (Number.isInteger(parsed) && parsed > 0 && String(parsed) === rawValue) {
      return parsed;
    }
    return rawValue;
  };
  return {
    task_id: String(taskSnapshot.task_id || ""),
    status: String(taskSnapshot.status || ""),
    overall_percent: normalizeNonNegativeNumber(taskSnapshot.overall_percent),
    current_text: String(taskSnapshot.current_text || ""),
    message: String(taskSnapshot.message || ""),
    error_code: String(taskSnapshot.error_code || ""),
    resume_available: Boolean(taskSnapshot.resume_available),
    resume_stage: String(taskSnapshot.resume_stage || ""),
    stages: Array.isArray(taskSnapshot.stages) ? taskSnapshot.stages.map((item) => ({ ...item })) : [],
    counters: taskSnapshot.counters && typeof taskSnapshot.counters === "object" ? { ...taskSnapshot.counters } : {},
    lesson:
      taskSnapshot.lesson && typeof taskSnapshot.lesson === "object"
        ? {
            id: normalizeLessonId(taskSnapshot.lesson.id),
            title: String(taskSnapshot.lesson.title || ""),
            source_filename: String(taskSnapshot.lesson.source_filename || ""),
            asr_model: String(taskSnapshot.lesson.asr_model || ""),
          }
        : null,
  };
}

function normalizeSnapshotPayload(payload = {}) {
  const rawTaskSnapshot =
    payload.task_snapshot && typeof payload.task_snapshot === "object"
      ? payload.task_snapshot
      : payload.taskSnapshot && typeof payload.taskSnapshot === "object"
        ? payload.taskSnapshot
        : null;
  const normalizedTaskSnapshot = normalizeTaskSnapshot(rawTaskSnapshot);
  const normalizedWorkspace =
    normalizeWorkspaceSnapshot(payload.workspace) || normalizeWorkspaceSnapshot(rawTaskSnapshot?.workspace);
  return {
    task_id:
      String(payload.task_id || normalizedTaskSnapshot?.task_id || normalizedWorkspace?.restore_pointer?.task_id || normalizedWorkspace?.task_id || ""),
    phase: String(payload.phase || ""),
    task_snapshot: normalizedTaskSnapshot,
    workspace: normalizedWorkspace,
    selected_upload_model: String(payload.selected_upload_model || ""),
    file_blob: normalizeBlob(payload.file_blob),
    file_name: String(payload.file_name || ""),
    media_type: String(payload.media_type || ""),
    file_size_bytes: normalizeNonNegativeNumber(payload.file_size_bytes),
    file_last_modified_ms: normalizeNonNegativeNumber(payload.file_last_modified_ms),
    desktop_source_path: String(payload.desktop_source_path || ""),
    cover_data_url: String(payload.cover_data_url || ""),
    cover_width: normalizeNonNegativeNumber(payload.cover_width),
    cover_height: normalizeNonNegativeNumber(payload.cover_height),
    aspect_ratio: normalizeNonNegativeNumber(payload.aspect_ratio),
    duration_seconds: normalizeNonNegativeNumber(payload.duration_seconds),
    is_video_source: Boolean(payload.is_video_source),
    generation_mode: String(payload.generation_mode || "").trim().toLowerCase() === "balanced" ? "balanced" : "fast",
    upload_percent: normalizeNonNegativeNumber(payload.upload_percent),
    status_text: String(payload.status_text || ""),
    semantic_split_enabled: Boolean(payload.semantic_split_enabled),
    binding_completed: Boolean(payload.binding_completed),
  };
}

function sanitizeStoredRecord(record, fallbackId = "") {
  if (!record || typeof record !== "object") {
    return null;
  }
  return {
    id: String(record.id || fallbackId || ""),
    owner_user_id: normalizeOwnerUserId(record.owner_user_id),
    snapshot_type: String(record.snapshot_type || ""),
    ...normalizeSnapshotPayload(record),
    updated_at: normalizeTimestamp(record.updated_at) || Date.now(),
  };
}

function migrateExistingRecords(store) {
  const cursorRequest = store.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) {
      return;
    }
    if (cursor.key === LEGACY_ACTIVE_KEY) {
      cursor.delete();
      cursor.continue();
      return;
    }
    const nextValue = sanitizeStoredRecord(cursor.value, String(cursor.key || ""));
    if (nextValue && nextValue.id) {
      cursor.update(nextValue);
    }
    cursor.continue();
  };
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
      migrateExistingRecords(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开生成任务缓存失败"));
  });
}

function resetDatabase() {
  assertIndexedDbAvailable();
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function withStore(mode, handler) {
  const run = () =>
    openDatabase().then(
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
  return run().catch(async (error) => {
    const message = String(error?.message || error || "");
    const shouldReset = /internal error|unknownerror|versionerror/i.test(message);
    if (!shouldReset) {
      throw error;
    }
    await resetDatabase();
    return run();
  });
}

export async function saveActiveGenerationTask(ownerUserId, payload) {
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);
  const scopedKey = buildScopedActiveKey(normalizedOwnerUserId);
  if (!scopedKey) return;
  const normalizedPayload = normalizeSnapshotPayload(payload);
  await withStore("readwrite", (store) => {
    store.delete(LEGACY_ACTIVE_KEY);
    return store.put({
      id: scopedKey,
      owner_user_id: normalizedOwnerUserId,
      ...normalizedPayload,
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
  return normalizeOwnerUserId(result.owner_user_id) === normalizeOwnerUserId(ownerUserId) ? normalizeSnapshotPayload(result) : null;
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
  const normalizedPayload = normalizeSnapshotPayload(payload);
  await withStore("readwrite", (store) =>
    store.put({
      id: snapshotKey,
      owner_user_id: normalizedOwnerUserId,
      snapshot_type: "upload_success",
      ...normalizedPayload,
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
  return normalizeOwnerUserId(result.owner_user_id) === normalizeOwnerUserId(ownerUserId) ? normalizeSnapshotPayload(result) : null;
}

export async function clearUploadPanelSuccessSnapshot(ownerUserId) {
  const snapshotKey = buildSuccessSnapshotKey(ownerUserId);
  if (!snapshotKey) return;
  await withStore("readwrite", (store) => store.delete(snapshotKey));
}

export async function clearUploadPanelTaskSnapshots(ownerUserId) {
  await Promise.all([clearActiveGenerationTask(ownerUserId), clearUploadPanelSuccessSnapshot(ownerUserId)]);
}
