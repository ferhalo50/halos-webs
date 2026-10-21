-- TV databases ONLY. Additive; does not remove or hide existing media.
UPDATE settings SET storage_limit_bytes=1000000000,
  used_bytes=COALESCE((SELECT SUM(size_bytes) FROM media),0),updated_at=CURRENT_TIMESTAMP
WHERE id='main';

-- Durable upload intents keep in-flight/cleanup bytes accounted for even if a
-- worker stops. Never expose these as playable content.
CREATE TABLE upload_intents (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=95000000),
  actor_id TEXT NOT NULL REFERENCES admin_users(id),
  state TEXT NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','cleanup')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
