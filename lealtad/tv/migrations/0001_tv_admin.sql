-- Diseño para una D1 NUEVA de Renace Café TV. No ejecutar sobre Renace Card.
CREATE TABLE IF NOT EXISTS tv_settings (
  business_id TEXT PRIMARY KEY,
  storage_limit_bytes INTEGER NOT NULL CHECK (storage_limit_bytes > 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tv_media (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('base', 'r2')),
  name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT,
  source TEXT NOT NULL,
  r2_key TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  CHECK ((origin = 'base' AND r2_key IS NULL) OR (origin = 'r2' AND r2_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tv_media_business_order ON tv_media (business_id, deleted_at, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tv_media_r2_key ON tv_media (r2_key) WHERE r2_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS tv_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  media_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tv_audit_business_time ON tv_audit (business_id, created_at DESC);
