-- Base EXCLUSIVA de Renace Cafe TV. No aplicar a Renace Card.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  password_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS login_limits (
  rate_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  storage_limit_bytes INTEGER NOT NULL CHECK (storage_limit_bytes > 0),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO settings(id, storage_limit_bytes, used_bytes)
VALUES ('main', 5000000000, 0);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL,
  deleting INTEGER NOT NULL DEFAULT 0 CHECK (deleting IN (0, 1)),
  created_by TEXT REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_playlist ON media(active, deleting, sort_order, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES admin_users(id),
  action TEXT NOT NULL,
  media_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);
