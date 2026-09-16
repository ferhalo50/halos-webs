ALTER TABLE loyalty_events ADD COLUMN voided INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0,1));
DROP INDEX one_stamp_per_business_day;
CREATE UNIQUE INDEX one_stamp_per_business_day ON loyalty_events(card_id,business_day)
  WHERE event_type='stamp' AND voided=0;

CREATE TABLE stamp_adjustments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  admin_id TEXT NOT NULL REFERENCES users(id),
  before_stamps INTEGER NOT NULL,
  after_stamps INTEGER NOT NULL CHECK (after_stamps>=0),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 200),
  void_event_id TEXT,
  created_at TEXT NOT NULL,
  CHECK (abs(after_stamps-before_stamps)=1)
);
CREATE INDEX stamp_adjustments_business_created ON stamp_adjustments(business_id,created_at DESC);

-- Apply the balance, optional visit cancellation and audit record atomically.
CREATE TRIGGER apply_stamp_adjustment BEFORE INSERT ON stamp_adjustments BEGIN
  UPDATE loyalty_cards SET stamps=NEW.after_stamps,updated_at=NEW.created_at
    WHERE id=NEW.card_id AND business_id=NEW.business_id AND customer_id=NEW.customer_id
      AND stamps=NEW.before_stamps
      AND NEW.after_stamps <= (SELECT reward_goal FROM businesses WHERE id=NEW.business_id)
      AND EXISTS (SELECT 1 FROM users WHERE id=NEW.customer_id AND active=1 AND deleted_at IS NULL);
  SELECT RAISE(ABORT,'stamp_adjustment_conflict') WHERE changes()<>1;
  UPDATE loyalty_events SET voided=1
    WHERE id=NEW.void_event_id AND card_id=NEW.card_id AND business_id=NEW.business_id
      AND event_type='stamp' AND voided=0 AND NEW.after_stamps=NEW.before_stamps-1;
  SELECT RAISE(ABORT,'stamp_adjustment_conflict') WHERE NEW.void_event_id IS NOT NULL AND changes()<>1;
END;
