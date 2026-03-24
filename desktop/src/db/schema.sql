CREATE TABLE IF NOT EXISTS sync_journals (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  local_updated_at TEXT DEFAULT NULL,
  remote_updated_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_journals_table_status
  ON sync_journals(table_name, status);

CREATE INDEX IF NOT EXISTS idx_sync_journals_record
  ON sync_journals(table_name, record_id);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  local_data TEXT DEFAULT NULL,
  remote_data TEXT DEFAULT NULL,
  conflict TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL,
  resolved_at TEXT DEFAULT NULL,
  resolution TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_unresolved
  ON sync_conflicts(resolved_at, table_name);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_record
  ON sync_conflicts(table_name, record_id);

CREATE TABLE IF NOT EXISTS auth_cache (
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
);

CREATE INDEX IF NOT EXISTS idx_auth_cache_user_id
  ON auth_cache(user_id);
