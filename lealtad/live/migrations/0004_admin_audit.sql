CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  admin_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('pin_reset')),
  created_at TEXT NOT NULL,
  metadata TEXT
);

CREATE INDEX admin_audit_business_created
  ON admin_audit_log(business_id, created_at DESC);

CREATE INDEX admin_audit_target
  ON admin_audit_log(target_user_id, created_at DESC);
