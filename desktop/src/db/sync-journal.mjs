function ensureNonEmptyString(value, label) {
  const next = String(value == null ? "" : value).trim();
  if (!next) {
    throw new Error(`${label} is required.`);
  }
  return next;
}

function asInteger(value, label, fallbackValue = 0) {
  if (value == null || value === "") {
    return fallbackValue;
  }
  const next = Number.parseInt(value, 10);
  if (!Number.isFinite(next)) {
    throw new Error(`${label} must be a number.`);
  }
  return next;
}

function asNullableString(value) {
  if (value == null || value === "") {
    return null;
  }
  return String(value);
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

function asJsonText(value, fallbackValue) {
  return JSON.stringify(value == null ? fallbackValue : value);
}

function mapJournalRow(row) {
  return {
    id: row.id,
    table_name: row.table_name,
    record_id: row.record_id,
    operation: row.operation,
    version: Number(row.version || 1),
    synced_at: row.synced_at || null,
    status: row.status || "pending",
    local_updated_at: row.local_updated_at || null,
    remote_updated_at: row.remote_updated_at || null,
  };
}

function mapConflictRow(row) {
  const localData = tryParseJson(row.local_data, null);
  const remoteData = tryParseJson(row.remote_data, null);
  const conflict = tryParseJson(row.conflict, {
    local: localData,
    remote: remoteData,
  });

  return {
    id: row.id,
    table_name: row.table_name,
    record_id: row.record_id,
    local_data: localData,
    remote_data: remoteData,
    conflict,
    detected_at: row.detected_at,
    resolved_at: row.resolved_at || null,
    resolution: row.resolution || null,
  };
}

function normalizeConflictInput(input, createId, nowIso) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!source) {
    throw new Error("conflict must be an object.");
  }

  const localData = source.localData ?? source.local_data ?? source.conflict?.local ?? null;
  const remoteData = source.remoteData ?? source.remote_data ?? source.conflict?.remote ?? null;

  return {
    id: ensureNonEmptyString(source.id || createId("sync-conflict"), "conflict.id"),
    table_name: ensureNonEmptyString(source.tableName || source.table_name, "conflict.tableName"),
    record_id: ensureNonEmptyString(source.recordId || source.record_id, "conflict.recordId"),
    local_data: asJsonText(localData, null),
    remote_data: asJsonText(remoteData, null),
    conflict: asJsonText(
      source.conflict ?? {
        local: localData,
        remote: remoteData,
      },
      {},
    ),
    detected_at: String(source.detectedAt || source.detected_at || nowIso()),
    resolved_at: asNullableString(source.resolvedAt || source.resolved_at),
    resolution: asNullableString(source.resolution),
  };
}

export function createSyncJournalStore({
  getDatabase,
  runStatement,
  queryRows,
  persistDatabase,
  nowIso,
  createId,
}) {
  function database() {
    const current = typeof getDatabase === "function" ? getDatabase() : null;
    if (!current) {
      throw new Error("SQLite database is not initialized.");
    }
    return current;
  }

  function getJournalById(id) {
    return queryRows(
      database(),
      `SELECT id, table_name, record_id, operation, version, synced_at, status, local_updated_at, remote_updated_at
         FROM sync_journals
        WHERE id = ?
        LIMIT 1;`,
      [id],
    )[0];
  }

  function getConflictById(id) {
    return queryRows(
      database(),
      `SELECT id, table_name, record_id, local_data, remote_data, conflict, detected_at, resolved_at, resolution
         FROM sync_conflicts
        WHERE id = ?
        LIMIT 1;`,
      [id],
    )[0];
  }

  async function maybePersist(shouldPersist) {
    if (shouldPersist !== false) {
      await persistDatabase();
    }
  }

  return {
    async logSync(tableName, recordId, operation, version, options = {}) {
      const normalizedTableName = ensureNonEmptyString(tableName, "tableName");
      const normalizedRecordId = ensureNonEmptyString(recordId, "recordId");
      const normalizedOperation = ensureNonEmptyString(operation, "operation").toUpperCase();
      const normalizedVersion = Math.max(1, asInteger(version, "version", 1));
      const row = {
        id: ensureNonEmptyString(options.id || createId("sync-journal"), "journal.id"),
        table_name: normalizedTableName,
        record_id: normalizedRecordId,
        operation: normalizedOperation,
        version: normalizedVersion,
        synced_at: asNullableString(options.syncedAt ?? options.synced_at),
        status: ensureNonEmptyString(options.status || "pending", "status"),
        local_updated_at: asNullableString(options.localUpdatedAt ?? options.local_updated_at),
        remote_updated_at: asNullableString(options.remoteUpdatedAt ?? options.remote_updated_at),
      };

      runStatement(
        database(),
        `INSERT INTO sync_journals (
           id, table_name, record_id, operation, version, synced_at, status, local_updated_at, remote_updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          row.id,
          row.table_name,
          row.record_id,
          row.operation,
          row.version,
          row.synced_at,
          row.status,
          row.local_updated_at,
          row.remote_updated_at,
        ],
      );

      await maybePersist(options.persist);
      return mapJournalRow(getJournalById(row.id) || row);
    },

    async saveConflict(conflict, options = {}) {
      const normalized = normalizeConflictInput(conflict, createId, nowIso);
      runStatement(
        database(),
        `INSERT INTO sync_conflicts (
           id, table_name, record_id, local_data, remote_data, conflict, detected_at, resolved_at, resolution
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           table_name = excluded.table_name,
           record_id = excluded.record_id,
           local_data = excluded.local_data,
           remote_data = excluded.remote_data,
           conflict = excluded.conflict,
           detected_at = excluded.detected_at,
           resolved_at = excluded.resolved_at,
           resolution = excluded.resolution;`,
        [
          normalized.id,
          normalized.table_name,
          normalized.record_id,
          normalized.local_data,
          normalized.remote_data,
          normalized.conflict,
          normalized.detected_at,
          normalized.resolved_at,
          normalized.resolution,
        ],
      );

      runStatement(
        database(),
        `UPDATE sync_journals
            SET status = 'conflict',
                remote_updated_at = COALESCE(?, remote_updated_at)
          WHERE table_name = ?
            AND record_id = ?
            AND status = 'pending';`,
        [
          normalized.detected_at,
          normalized.table_name,
          normalized.record_id,
        ],
      );

      await maybePersist(options.persist);
      return mapConflictRow(getConflictById(normalized.id) || normalized);
    },

    async getUnresolvedConflicts() {
      return queryRows(
        database(),
        `SELECT id, table_name, record_id, local_data, remote_data, conflict, detected_at, resolved_at, resolution
           FROM sync_conflicts
          WHERE resolved_at IS NULL
       ORDER BY datetime(detected_at) DESC, id DESC;`,
      ).map(mapConflictRow);
    },

    async resolveConflict(conflictId, resolution, options = {}) {
      const normalizedConflictId = ensureNonEmptyString(conflictId, "conflictId");
      const normalizedResolution = ensureNonEmptyString(resolution, "resolution");
      const existing = getConflictById(normalizedConflictId);
      if (!existing) {
        return {
          resolved: false,
          id: normalizedConflictId,
          resolution: normalizedResolution,
        };
      }

      const resolvedAt = nowIso();
      runStatement(
        database(),
        `UPDATE sync_conflicts
            SET resolved_at = ?,
                resolution = ?
          WHERE id = ?;`,
        [resolvedAt, normalizedResolution, normalizedConflictId],
      );
      runStatement(
        database(),
        `UPDATE sync_journals
            SET status = 'pending'
          WHERE table_name = ?
            AND record_id = ?
            AND status = 'conflict';`,
        [existing.table_name, existing.record_id],
      );

      await maybePersist(options.persist);
      return {
        resolved: true,
        id: normalizedConflictId,
        resolution: normalizedResolution,
        resolved_at: resolvedAt,
      };
    },

    async getPendingRecords(tableName) {
      const normalizedTableName = ensureNonEmptyString(tableName, "tableName");
      return queryRows(
        database(),
        `SELECT id, table_name, record_id, operation, version, synced_at, status, local_updated_at, remote_updated_at
           FROM sync_journals
          WHERE table_name = ?
            AND status = 'pending'
       ORDER BY datetime(local_updated_at) ASC, id ASC;`,
        [normalizedTableName],
      ).map(mapJournalRow);
    },

    async markSynced(ids, options = {}) {
      const normalizedIds = Array.isArray(ids)
        ? ids.map((id, index) => ensureNonEmptyString(id, `ids[${index}]`))
        : [];

      if (!normalizedIds.length) {
        return {
          updated: 0,
          ids: [],
        };
      }

      const placeholders = normalizedIds.map(() => "?").join(", ");
      const syncedAt = nowIso();
      runStatement(
        database(),
        `UPDATE sync_journals
            SET status = 'synced',
                synced_at = ?
          WHERE id IN (${placeholders});`,
        [syncedAt, ...normalizedIds],
      );

      await maybePersist(options.persist);
      return {
        updated: normalizedIds.length,
        ids: normalizedIds,
        synced_at: syncedAt,
      };
    },
  };
}
