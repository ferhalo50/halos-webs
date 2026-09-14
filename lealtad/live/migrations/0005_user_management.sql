ALTER TABLE users
ADD COLUMN must_change_secret INTEGER NOT NULL DEFAULT 0
CHECK (must_change_secret IN (0, 1));

ALTER TABLE users
ADD COLUMN deleted_at TEXT;

CREATE TABLE admin_audit_log_v2 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  admin_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('pin_reset', 'customer_updated', 'customer_deleted', 'employee_updated', 'employee_deleted')),
  created_at TEXT NOT NULL,
  metadata TEXT
);

INSERT INTO admin_audit_log_v2 (id,business_id,admin_id,target_user_id,action,created_at,metadata)
SELECT id,business_id,admin_id,target_user_id,action,created_at,metadata FROM admin_audit_log;

DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_v2 RENAME TO admin_audit_log;

CREATE INDEX admin_audit_business_created
  ON admin_audit_log(business_id, created_at DESC);

CREATE INDEX admin_audit_target
  ON admin_audit_log(target_user_id, created_at DESC);

CREATE INDEX users_business_role_active
  ON users(business_id, role, active, deleted_at);
