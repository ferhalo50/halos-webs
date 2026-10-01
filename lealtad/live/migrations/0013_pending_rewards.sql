-- Explicit per-item rewards. No reconstruction of historical purchases.
ALTER TABLE loyalty_cards ADD COLUMN rewards_pending INTEGER NOT NULL DEFAULT 0 CHECK(rewards_pending>=0);
ALTER TABLE loyalty_cards ADD COLUMN reward_version INTEGER NOT NULL DEFAULT 0 CHECK(reward_version>=0);

-- A currently full card is a known, unredeemed entitlement in the old model.
-- Other cards start at zero pending; redeemed_count and historical events stay intact.
UPDATE loyalty_cards SET rewards_pending=1,stamps=0
WHERE business_id IN (SELECT id FROM businesses WHERE stamp_policy='per_item')
 AND stamps=(SELECT reward_goal FROM businesses WHERE id=business_id);

CREATE TABLE per_item_reward_operations (
 id TEXT PRIMARY KEY,
 business_id TEXT NOT NULL REFERENCES businesses(id),
 card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
 customer_id TEXT NOT NULL REFERENCES users(id),
 employee_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('purchase','redeem')),
 paid_items INTEGER NOT NULL CHECK(paid_items BETWEEN 0 AND 99),
 before_stamps INTEGER NOT NULL CHECK(before_stamps>=0),
 before_rewards INTEGER NOT NULL CHECK(before_rewards>=0),
 before_version INTEGER NOT NULL CHECK(before_version>=0),
 business_day TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CHECK((kind='purchase' AND paid_items>=1) OR (kind='redeem' AND paid_items=0))
);
CREATE INDEX per_item_rewards_business_created ON per_item_reward_operations(business_id,created_at DESC);

-- Retire the old auto-redemption path; old code fails safely until upgraded.
DROP TRIGGER apply_per_item_purchase;
CREATE TRIGGER apply_per_item_purchase BEFORE INSERT ON loyalty_purchase_operations BEGIN
 SELECT RAISE(ABORT,'explicit_reward_operation_required');
END;

CREATE TRIGGER apply_per_item_reward_operation BEFORE INSERT ON per_item_reward_operations BEGIN
 SELECT RAISE(ABORT,'reward_conflict') WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_cards c JOIN businesses b ON b.id=c.business_id
  JOIN users u ON u.id=c.customer_id JOIN users staff ON staff.id=NEW.employee_id
  WHERE c.id=NEW.card_id AND c.business_id=NEW.business_id AND c.customer_id=NEW.customer_id
   AND b.stamp_policy='per_item' AND c.stamps=NEW.before_stamps AND c.stamps<b.reward_goal
   AND c.rewards_pending=NEW.before_rewards AND c.reward_version=NEW.before_version
   AND u.business_id=NEW.business_id AND u.active=1 AND u.deleted_at IS NULL
   AND staff.business_id=NEW.business_id AND staff.role IN ('employee','admin') AND staff.active=1 AND staff.deleted_at IS NULL
 );
 SELECT RAISE(ABORT,'reward_unavailable') WHERE NEW.kind='redeem' AND NEW.before_rewards<1;
 UPDATE loyalty_cards SET
  stamps=CASE WHEN NEW.kind='purchase' THEN (NEW.before_stamps+NEW.paid_items)%(SELECT reward_goal FROM businesses WHERE id=NEW.business_id) ELSE stamps END,
  rewards_pending=NEW.before_rewards+CASE WHEN NEW.kind='purchase' THEN (NEW.before_stamps+NEW.paid_items)/(SELECT reward_goal FROM businesses WHERE id=NEW.business_id) ELSE -1 END,
  redeemed_count=redeemed_count+CASE WHEN NEW.kind='redeem' THEN 1 ELSE 0 END,
  reward_version=reward_version+1,updated_at=NEW.created_at
 WHERE id=NEW.card_id AND business_id=NEW.business_id AND reward_version=NEW.before_version;
 SELECT RAISE(ABORT,'reward_conflict') WHERE changes()<>1;
 INSERT INTO loyalty_events(id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,metadata,quantity,daily_limited)
 SELECT NEW.id,NEW.business_id,NEW.card_id,NEW.customer_id,NEW.employee_id,
  CASE WHEN NEW.kind='purchase' THEN 'stamp' ELSE 'redeem' END,NEW.business_day,NEW.created_at,
  json_object('operation_id',NEW.id,'balance_applied',1,'paid_items',NEW.paid_items,
   'progress_before',NEW.before_stamps,'progress_after',c.stamps,
   'rewards_generated',CASE WHEN NEW.kind='purchase' THEN (NEW.before_stamps+NEW.paid_items)/b.reward_goal ELSE 0 END,
   'rewards_redeemed',CASE WHEN NEW.kind='redeem' THEN 1 ELSE 0 END,
   'rewards_pending_before',NEW.before_rewards,'rewards_pending_after',c.rewards_pending,
   'description',CASE WHEN NEW.kind='purchase' THEN printf('%d cafés pagados; progreso %d/%d; recompensas generadas: %d; bebidas gratis pendientes: %d',NEW.paid_items,c.stamps,b.reward_goal,(NEW.before_stamps+NEW.paid_items)/b.reward_goal,c.rewards_pending)
    ELSE printf('1 bebida gratis canjeada; progreso %d/%d; bebidas gratis pendientes: %d',c.stamps,b.reward_goal,c.rewards_pending) END),
  CASE WHEN NEW.kind='purchase' THEN NEW.paid_items ELSE 1 END,0
 FROM loyalty_cards c JOIN businesses b ON b.id=c.business_id WHERE c.id=NEW.card_id AND c.business_id=NEW.business_id;
END;

-- Existing administrative adjustments remain audited and cannot leave a full
-- per-item card stranded. Daily tenants never enter this trigger.
CREATE TRIGGER normalize_per_item_adjustment AFTER UPDATE OF stamps ON loyalty_cards
WHEN NEW.reward_version=OLD.reward_version AND NEW.stamps<>OLD.stamps
 AND (SELECT stamp_policy FROM businesses WHERE id=NEW.business_id)='per_item'
BEGIN
 UPDATE loyalty_cards SET
  stamps=NEW.stamps%(SELECT reward_goal FROM businesses WHERE id=NEW.business_id),
  rewards_pending=rewards_pending+NEW.stamps/(SELECT reward_goal FROM businesses WHERE id=NEW.business_id),
  reward_version=reward_version+1 WHERE id=NEW.id;
END;
