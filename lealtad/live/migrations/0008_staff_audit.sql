-- Canonical actor for administrator and employee actions; preserve the legacy column.
ALTER TABLE admin_audit_log ADD COLUMN actor_id TEXT REFERENCES users(id);
UPDATE admin_audit_log SET actor_id=admin_id WHERE actor_id IS NULL;
