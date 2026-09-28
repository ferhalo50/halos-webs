-- Configurable stamp policy. Existing businesses retain one stamp per calendar day.
ALTER TABLE businesses ADD COLUMN stamp_policy TEXT NOT NULL DEFAULT 'daily'
  CHECK (stamp_policy IN ('daily','per_item'));

-- One loyalty event may represent several coffees in a single Santofé purchase.
ALTER TABLE loyalty_events ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1
  CHECK (quantity BETWEEN 1 AND 99);
ALTER TABLE loyalty_events ADD COLUMN daily_limited INTEGER NOT NULL DEFAULT 1
  CHECK (daily_limited IN (0,1));

DROP INDEX one_stamp_per_business_day;
CREATE UNIQUE INDEX one_stamp_per_business_day
  ON loyalty_events(card_id,business_day)
  WHERE event_type='stamp' AND voided=0 AND daily_limited=1;

-- Per-item tenants apply the whole purchase atomically and never exceed one reward.
CREATE TRIGGER apply_per_item_stamp BEFORE INSERT ON loyalty_events
WHEN NEW.event_type='stamp'
 AND (SELECT stamp_policy FROM businesses WHERE id=NEW.business_id)='per_item'
BEGIN
  SELECT RAISE(ABORT,'invalid_stamp_policy') WHERE NEW.daily_limited<>0;
  UPDATE loyalty_cards
    SET stamps=stamps+NEW.quantity,updated_at=NEW.created_at
    WHERE id=NEW.card_id AND business_id=NEW.business_id AND customer_id=NEW.customer_id
      AND stamps+NEW.quantity <= (SELECT reward_goal FROM businesses WHERE id=NEW.business_id);
  SELECT RAISE(ABORT,'stamp_conflict') WHERE changes()<>1;
END;

INSERT INTO businesses(id,slug,name,reward_goal,reward_name,timezone,active,stamp_policy)
VALUES('business_santofe','santofe','Santofé',10,'Café gratis','America/Tijuana',1,'per_item')
ON CONFLICT(slug) DO NOTHING;
