-- Apply ONLY to the TV database selected explicitly. Never to loyalty.
-- NULL preserves the existing playlist default (currently 10 seconds).
ALTER TABLE media ADD COLUMN duration_seconds INTEGER
  CHECK (duration_seconds IS NULL OR (media_type = 'image' AND typeof(duration_seconds) = 'integer' AND duration_seconds BETWEEN 1 AND 300));
ALTER TABLE media ADD COLUMN duration_revision INTEGER NOT NULL DEFAULT 0;
