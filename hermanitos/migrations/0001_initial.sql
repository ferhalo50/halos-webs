PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  qr_token TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  last_scan_ms INTEGER NOT NULL DEFAULT 0,
  completed_reset_at TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX only_one_admin ON users(role) WHERE role = 'admin';
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE INDEX limits_expiry ON rate_limits(expires_ms);
CREATE TABLE stamps (
  id TEXT PRIMARY KEY,
  scanner_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  voided_at TEXT,
  CHECK(scanner_id <> target_id)
);
CREATE INDEX stamps_scanner ON stamps(scanner_id, voided_at, created_at);
CREATE INDEX stamps_target ON stamps(target_id, created_at);
CREATE TABLE favors (
  id TEXT PRIMARY KEY,
  creditor_id TEXT NOT NULL REFERENCES users(id),
  debtor_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cleared','cancelled')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  closed_at TEXT,
  CHECK(creditor_id <> debtor_id),
  CHECK((status='pending' AND closed_at IS NULL AND completed_at IS NULL) OR (status='completed' AND completed_at IS NOT NULL AND closed_at IS NOT NULL) OR (status IN ('cleared','cancelled') AND closed_at IS NOT NULL))
);
CREATE INDEX favors_creditor ON favors(creditor_id,status,created_at);
CREATE INDEX favors_debtor ON favors(debtor_id,status,created_at);
CREATE INDEX favors_completed ON favors(debtor_id,completed_at);
-- Immutable snapshots keep closing-month debts accurate after an admin reassigns a favor.
CREATE TABLE favor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  favor_id TEXT NOT NULL REFERENCES favors(id),
  creditor_id TEXT NOT NULL REFERENCES users(id),
  debtor_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX favor_events_snapshot ON favor_events(favor_id,recorded_at,id);
CREATE INDEX favor_events_debtor ON favor_events(debtor_id,status,created_at);
CREATE TRIGGER favor_event_insert AFTER INSERT ON favors BEGIN
  INSERT INTO favor_events(favor_id,creditor_id,debtor_id,status,created_at,recorded_at)
    VALUES(NEW.id,NEW.creditor_id,NEW.debtor_id,NEW.status,NEW.created_at,NEW.created_at);
END;
CREATE TRIGGER favor_event_update AFTER UPDATE ON favors BEGIN
  INSERT INTO favor_events(favor_id,creditor_id,debtor_id,status,created_at,recorded_at)
    VALUES(NEW.id,NEW.creditor_id,NEW.debtor_id,NEW.status,NEW.created_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  actor_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX notifications_user ON notifications(user_id,read_at,id);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_time ON audit(created_at);
-- Enforce the real-time cooldown atomically, including simultaneous requests.
CREATE TRIGGER stamp_cooldown BEFORE INSERT ON stamps BEGIN
  SELECT RAISE(ABORT,'invalid_member') WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.scanner_id AND active=1 AND role='member')
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target_id AND active=1 AND role='member');
  SELECT RAISE(ABORT,'scan_cooldown') WHERE (SELECT last_scan_ms FROM users WHERE id=NEW.scanner_id) > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)-60000;
  UPDATE users SET last_scan_ms=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE id=NEW.scanner_id;
END;
-- A favor spends ten stamps exactly once; the check and insert share a transaction.
CREATE TRIGGER favor_credit BEFORE INSERT ON favors BEGIN
  SELECT RAISE(ABORT,'invalid_member') WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.creditor_id AND active=1 AND role='member')
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.debtor_id AND active=1 AND role='member');
  SELECT RAISE(ABORT,'no_credit') WHERE
    (SELECT COUNT(*)/10 FROM stamps WHERE scanner_id=NEW.creditor_id AND voided_at IS NULL)
    <= (SELECT COUNT(*) FROM favors WHERE creditor_id=NEW.creditor_id AND status<>'cancelled')
    ;
END;
CREATE TRIGGER stamp_notification AFTER INSERT ON stamps BEGIN
  INSERT INTO notifications(user_id,actor_id,kind,reference_id,created_at) VALUES(NEW.target_id,NEW.scanner_id,'stamp',NEW.id,NEW.created_at);
  INSERT INTO audit(actor_id,action,entity_id,details,created_at) VALUES(NEW.scanner_id,'stamp',NEW.id,json_object('target_id',NEW.target_id),NEW.created_at);
END;
CREATE TRIGGER favor_notification AFTER INSERT ON favors BEGIN
  INSERT INTO notifications(user_id,actor_id,kind,reference_id,created_at) VALUES(NEW.debtor_id,NEW.creditor_id,'favor_requested',NEW.id,NEW.created_at);
  INSERT INTO audit(actor_id,action,entity_id,details,created_at) VALUES(NEW.creditor_id,'favor_requested',NEW.id,json_object('debtor_id',NEW.debtor_id),NEW.created_at);
END;
CREATE TRIGGER favor_completed AFTER UPDATE OF status ON favors WHEN NEW.status='completed' AND OLD.status='pending' BEGIN
  INSERT INTO notifications(user_id,actor_id,kind,reference_id,created_at) VALUES(NEW.debtor_id,NEW.creditor_id,'favor_completed',NEW.id,NEW.completed_at);
END;
