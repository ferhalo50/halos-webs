-- Additive: every historical/regular scan still represents exactly one stamp.
ALTER TABLE stamps ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 99);
ALTER TABLE stamps ADD COLUMN admin_id TEXT REFERENCES users(id);
ALTER TABLE stamps ADD COLUMN reason TEXT;
ALTER TABLE stamps ADD COLUMN before_total INTEGER;
ALTER TABLE stamps ADD COLUMN before_spent INTEGER;

DROP TRIGGER stamp_cooldown;
CREATE TRIGGER stamp_cooldown BEFORE INSERT ON stamps WHEN NEW.admin_id IS NULL BEGIN
  SELECT RAISE(ABORT,'invalid_member') WHERE NEW.quantity<>1 OR NEW.reason IS NOT NULL OR NEW.before_total IS NOT NULL OR NEW.before_spent IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.scanner_id AND active=1 AND role='member')
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target_id AND active=1 AND role='member');
  SELECT RAISE(ABORT,'scan_cooldown') WHERE (SELECT last_scan_ms FROM users WHERE id=NEW.scanner_id) > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)-60000;
  UPDATE users SET last_scan_ms=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE id=NEW.scanner_id;
END;

CREATE TRIGGER validate_admin_stamp BEFORE INSERT ON stamps WHEN NEW.admin_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'invalid_member') WHERE NEW.target_id<>NEW.admin_id
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.admin_id AND role='admin' AND active=1 AND deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.scanner_id AND role='member' AND active=1 AND deleted_at IS NULL);
  SELECT RAISE(ABORT,'invalid_adjustment') WHERE NEW.reason IS NULL OR length(trim(NEW.reason)) NOT BETWEEN 5 AND 200;
  SELECT RAISE(ABORT,'admin_adjustment_conflict') WHERE NEW.before_total IS NULL OR NEW.before_spent IS NULL
    OR NEW.before_total<>(SELECT COALESCE(SUM(quantity),0) FROM stamps WHERE scanner_id=NEW.scanner_id AND voided_at IS NULL)
    OR NEW.before_spent<>(SELECT COUNT(*) FROM favors WHERE creditor_id=NEW.scanner_id AND status<>'cancelled');
END;

DROP TRIGGER favor_credit;
CREATE TRIGGER favor_credit BEFORE INSERT ON favors BEGIN
  SELECT RAISE(ABORT,'invalid_member') WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.creditor_id AND active=1 AND role='member')
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.debtor_id AND active=1 AND role='member');
  SELECT RAISE(ABORT,'no_credit') WHERE
    (SELECT COALESCE(SUM(quantity),0)/10 FROM stamps WHERE scanner_id=NEW.creditor_id AND voided_at IS NULL)
    <= (SELECT COUNT(*) FROM favors WHERE creditor_id=NEW.creditor_id AND status<>'cancelled');
END;

DROP TRIGGER stamp_notification;
CREATE TRIGGER stamp_notification AFTER INSERT ON stamps BEGIN
  INSERT INTO notifications(user_id,actor_id,kind,reference_id,created_at)
    VALUES(CASE WHEN NEW.admin_id IS NULL THEN NEW.target_id ELSE NEW.scanner_id END,
      COALESCE(NEW.admin_id,NEW.scanner_id),CASE WHEN NEW.admin_id IS NULL THEN 'stamp' ELSE 'admin-stamps-added' END,NEW.id,NEW.created_at);
  INSERT INTO audit(actor_id,action,entity_id,details,created_at)
    VALUES(COALESCE(NEW.admin_id,NEW.scanner_id),CASE WHEN NEW.admin_id IS NULL THEN 'stamp' ELSE 'admin-stamps-added' END,NEW.id,
      CASE WHEN NEW.admin_id IS NULL THEN json_object('target_id',NEW.target_id)
        ELSE json_object('user_id',NEW.scanner_id,'quantity',NEW.quantity,'reason',NEW.reason,'before_stamps',NEW.before_total,'after_stamps',NEW.before_total+NEW.quantity,'spent',NEW.before_spent) END,NEW.created_at);
END;
