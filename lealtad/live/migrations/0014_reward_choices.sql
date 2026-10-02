-- New decisions start at zero. Saved rewards and all historical rows stay intact.
ALTER TABLE loyalty_cards ADD COLUMN reward_choices_pending INTEGER NOT NULL DEFAULT 0 CHECK(reward_choices_pending>=0);
ALTER TABLE per_item_reward_operations ADD COLUMN before_choices INTEGER NOT NULL DEFAULT 0 CHECK(before_choices>=0);

CREATE TABLE reward_choice_operations (
 id TEXT PRIMARY KEY,
 business_id TEXT NOT NULL REFERENCES businesses(id),
 card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
 customer_id TEXT NOT NULL REFERENCES users(id),
 employee_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN ('save','redeem_now')),
 before_stamps INTEGER NOT NULL CHECK(before_stamps>=0),
 before_rewards INTEGER NOT NULL CHECK(before_rewards>=0),
 before_choices INTEGER NOT NULL CHECK(before_choices>0),
 before_version INTEGER NOT NULL CHECK(before_version>=0),
 business_day TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX reward_choices_business_created ON reward_choice_operations(business_id,created_at DESC);

DROP TRIGGER apply_per_item_reward_operation;
CREATE TRIGGER apply_per_item_reward_operation BEFORE INSERT ON per_item_reward_operations BEGIN
 SELECT RAISE(ABORT,'reward_decision_required') WHERE NEW.kind='purchase' AND EXISTS (
  SELECT 1 FROM loyalty_cards WHERE id=NEW.card_id AND business_id=NEW.business_id AND reward_choices_pending>0
 );
 SELECT RAISE(ABORT,'reward_conflict') WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_cards c JOIN businesses b ON b.id=c.business_id
  JOIN users u ON u.id=c.customer_id JOIN users staff ON staff.id=NEW.employee_id
  WHERE c.id=NEW.card_id AND c.business_id=NEW.business_id AND c.customer_id=NEW.customer_id
   AND b.stamp_policy='per_item' AND c.stamps=NEW.before_stamps AND c.stamps<b.reward_goal
   AND c.rewards_pending=NEW.before_rewards AND c.reward_choices_pending=NEW.before_choices AND c.reward_version=NEW.before_version
   AND u.business_id=NEW.business_id AND u.active=1 AND u.deleted_at IS NULL
   AND staff.business_id=NEW.business_id AND staff.role IN ('employee','admin') AND staff.active=1 AND staff.deleted_at IS NULL
 );
 SELECT RAISE(ABORT,'operation_processed') WHERE EXISTS (SELECT 1 FROM per_item_reward_operations WHERE id=NEW.id) OR EXISTS (SELECT 1 FROM reward_choice_operations WHERE id=NEW.id);
 SELECT RAISE(ABORT,'reward_unavailable') WHERE NEW.kind='redeem' AND NEW.before_rewards<1;
 UPDATE loyalty_cards SET
  stamps=CASE WHEN NEW.kind='purchase' THEN (NEW.before_stamps+NEW.paid_items)%(SELECT reward_goal FROM businesses WHERE id=NEW.business_id) ELSE stamps END,
  reward_choices_pending=NEW.before_choices+CASE WHEN NEW.kind='purchase' THEN (NEW.before_stamps+NEW.paid_items)/(SELECT reward_goal FROM businesses WHERE id=NEW.business_id) ELSE 0 END,
  rewards_pending=NEW.before_rewards-CASE WHEN NEW.kind='redeem' THEN 1 ELSE 0 END,
  redeemed_count=redeemed_count+CASE WHEN NEW.kind='redeem' THEN 1 ELSE 0 END,
  reward_version=reward_version+1,updated_at=NEW.created_at
 WHERE id=NEW.card_id AND business_id=NEW.business_id AND reward_version=NEW.before_version;
 SELECT RAISE(ABORT,'reward_conflict') WHERE changes()<>1;
 INSERT INTO loyalty_events(id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,metadata,quantity,daily_limited)
 SELECT NEW.id,NEW.business_id,NEW.card_id,NEW.customer_id,NEW.employee_id,
  CASE WHEN NEW.kind='purchase' THEN 'stamp' ELSE 'redeem' END,NEW.business_day,NEW.created_at,
  json_object('operation_id',NEW.id,'balance_applied',1,'decision_flow',1,'paid_items',NEW.paid_items,
   'progress_before',NEW.before_stamps,'progress_after',c.stamps,
   'rewards_generated',CASE WHEN NEW.kind='purchase' THEN (NEW.before_stamps+NEW.paid_items)/b.reward_goal ELSE 0 END,
   'rewards_redeemed',CASE WHEN NEW.kind='redeem' THEN 1 ELSE 0 END,
   'reward_choices_before',NEW.before_choices,'reward_choices_after',c.reward_choices_pending,
   'rewards_pending_before',NEW.before_rewards,'rewards_pending_after',c.rewards_pending,
   'description',CASE WHEN NEW.kind='purchase' THEN printf('%d cafés pagados; progreso %d/%d; recompensas generadas: %d; por decidir: %d; bebidas gratis guardadas: %d',NEW.paid_items,c.stamps,b.reward_goal,(NEW.before_stamps+NEW.paid_items)/b.reward_goal,c.reward_choices_pending,c.rewards_pending)
    ELSE printf('1 bebida guardada canjeada; progreso %d/%d; por decidir: %d; bebidas gratis guardadas: %d',c.stamps,b.reward_goal,c.reward_choices_pending,c.rewards_pending) END),
  CASE WHEN NEW.kind='purchase' THEN NEW.paid_items ELSE 1 END,0
 FROM loyalty_cards c JOIN businesses b ON b.id=c.business_id WHERE c.id=NEW.card_id AND c.business_id=NEW.business_id;
END;

-- Each INSERT applies exactly one decision plus its immutable audit snapshot.
CREATE TRIGGER apply_reward_choice BEFORE INSERT ON reward_choice_operations BEGIN
 SELECT RAISE(ABORT,'reward_conflict') WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_cards c JOIN businesses b ON b.id=c.business_id
  JOIN users u ON u.id=c.customer_id JOIN users staff ON staff.id=NEW.employee_id
  WHERE c.id=NEW.card_id AND c.business_id=NEW.business_id AND c.customer_id=NEW.customer_id
   AND b.stamp_policy='per_item' AND c.stamps=NEW.before_stamps AND c.stamps<b.reward_goal
   AND c.rewards_pending=NEW.before_rewards AND c.reward_choices_pending=NEW.before_choices AND c.reward_version=NEW.before_version
   AND u.business_id=NEW.business_id AND u.active=1 AND u.deleted_at IS NULL
   AND staff.business_id=NEW.business_id AND staff.role IN ('employee','admin') AND staff.active=1 AND staff.deleted_at IS NULL
 );
 SELECT RAISE(ABORT,'operation_processed') WHERE EXISTS (SELECT 1 FROM per_item_reward_operations WHERE id=NEW.id) OR EXISTS (SELECT 1 FROM reward_choice_operations WHERE id=NEW.id);
 UPDATE loyalty_cards SET
  reward_choices_pending=reward_choices_pending-1,
  rewards_pending=rewards_pending+CASE WHEN NEW.decision='save' THEN 1 ELSE 0 END,
  redeemed_count=redeemed_count+CASE WHEN NEW.decision='redeem_now' THEN 1 ELSE 0 END,
  reward_version=reward_version+1,updated_at=NEW.created_at
 WHERE id=NEW.card_id AND business_id=NEW.business_id AND reward_version=NEW.before_version AND reward_choices_pending>0;
 SELECT RAISE(ABORT,'reward_conflict') WHERE changes()<>1;
END;

-- Also guard administrative additions and normalize new adjustments, not history.
CREATE TRIGGER block_unresolved_reward_addition BEFORE UPDATE OF stamps ON loyalty_cards
WHEN NEW.stamps>OLD.stamps AND OLD.reward_choices_pending>0
 AND (SELECT stamp_policy FROM businesses WHERE id=OLD.business_id)='per_item'
BEGIN
 SELECT RAISE(ABORT,'reward_decision_required');
END;
DROP TRIGGER normalize_per_item_adjustment;
CREATE TRIGGER normalize_per_item_adjustment AFTER UPDATE OF stamps ON loyalty_cards
WHEN NEW.reward_version=OLD.reward_version AND NEW.stamps<>OLD.stamps
 AND (SELECT stamp_policy FROM businesses WHERE id=NEW.business_id)='per_item'
BEGIN
 UPDATE loyalty_cards SET
  stamps=NEW.stamps%(SELECT reward_goal FROM businesses WHERE id=NEW.business_id),
  reward_choices_pending=reward_choices_pending+NEW.stamps/(SELECT reward_goal FROM businesses WHERE id=NEW.business_id),
  reward_version=reward_version+1 WHERE id=NEW.id;
END;
