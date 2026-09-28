-- A Santofé order is processed atomically: paid coffees add stamps and the
-- coffee immediately following 10 paid coffees is redeemed without a stamp.
CREATE TABLE loyalty_purchase_operations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  employee_id TEXT NOT NULL REFERENCES users(id),
  total_coffees INTEGER NOT NULL CHECK (total_coffees BETWEEN 1 AND 10),
  before_stamps INTEGER NOT NULL CHECK (before_stamps BETWEEN 0 AND 99),
  business_day TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX loyalty_purchase_operations_business_created
  ON loyalty_purchase_operations(business_id,created_at DESC);

DROP TRIGGER apply_per_item_stamp;

CREATE TRIGGER apply_per_item_purchase BEFORE INSERT ON loyalty_purchase_operations
BEGIN
  SELECT RAISE(ABORT,'invalid_purchase_policy')
    WHERE (SELECT stamp_policy FROM businesses WHERE id=NEW.business_id)<>'per_item';

  SELECT RAISE(ABORT,'purchase_conflict') WHERE NOT EXISTS (
    SELECT 1 FROM loyalty_cards c
    JOIN businesses b ON b.id=c.business_id
    WHERE c.id=NEW.card_id AND c.business_id=NEW.business_id
      AND c.customer_id=NEW.customer_id AND c.stamps=NEW.before_stamps
      AND NEW.before_stamps<=b.reward_goal
  );

  UPDATE loyalty_cards
  SET stamps=(
        SELECT
          (NEW.before_stamps<b.reward_goal AND NEW.total_coffees<=b.reward_goal-NEW.before_stamps)
            *(NEW.before_stamps+NEW.total_coffees)
          +(NEW.before_stamps>=b.reward_goal)*(NEW.total_coffees-1)
          +(NEW.before_stamps<b.reward_goal AND NEW.total_coffees>b.reward_goal-NEW.before_stamps)
            *(NEW.total_coffees-(b.reward_goal-NEW.before_stamps)-1)
        FROM businesses b WHERE b.id=NEW.business_id
      ),
      redeemed_count=redeemed_count+(
        SELECT (NEW.before_stamps>=b.reward_goal
          OR NEW.total_coffees>b.reward_goal-NEW.before_stamps)
        FROM businesses b WHERE b.id=NEW.business_id
      ),
      updated_at=NEW.created_at
  WHERE id=NEW.card_id AND business_id=NEW.business_id
    AND customer_id=NEW.customer_id AND stamps=NEW.before_stamps;

  SELECT RAISE(ABORT,'purchase_conflict') WHERE changes()<>1;

  INSERT INTO loyalty_events
    (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,metadata,quantity,daily_limited)
  SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.card_id,NEW.customer_id,NEW.employee_id,
    'stamp',NEW.business_day,NEW.created_at,
    json_object(
      'operation_id',NEW.id,'total_coffees',NEW.total_coffees,'phase','current_card','balance_applied',1,
      'description',printf('%d cafés pagados en la tarjeta actual',MIN(NEW.total_coffees,b.reward_goal-NEW.before_stamps))
    ),
    MIN(NEW.total_coffees,b.reward_goal-NEW.before_stamps),0
  FROM businesses b
  WHERE b.id=NEW.business_id AND NEW.before_stamps<b.reward_goal;

  INSERT INTO loyalty_events
    (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,metadata,quantity,daily_limited)
  SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.card_id,NEW.customer_id,NEW.employee_id,
    'redeem',NEW.business_day,strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'+0.001 seconds'),
    json_object(
      'operation_id',NEW.id,'total_coffees',NEW.total_coffees,'phase','free_coffee','balance_applied',1,
      'description',printf('Café gratis aplicado dentro de pedido de %d cafés',NEW.total_coffees)
    ),1,0
  FROM businesses b
  WHERE b.id=NEW.business_id AND (
    NEW.before_stamps>=b.reward_goal
    OR NEW.total_coffees>b.reward_goal-NEW.before_stamps
  );

  INSERT INTO loyalty_events
    (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,metadata,quantity,daily_limited)
  SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.card_id,NEW.customer_id,NEW.employee_id,
    'stamp',NEW.business_day,strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'+0.002 seconds'),
    json_object(
      'operation_id',NEW.id,'total_coffees',NEW.total_coffees,'phase','next_card','balance_applied',1,
      'description',printf('%d cafés pagados en la siguiente tarjeta',
        (NEW.before_stamps>=b.reward_goal)*(NEW.total_coffees-1)
        +(NEW.before_stamps<b.reward_goal)*(NEW.total_coffees-(b.reward_goal-NEW.before_stamps)-1))
    ),
    (NEW.before_stamps>=b.reward_goal)*(NEW.total_coffees-1)
      +(NEW.before_stamps<b.reward_goal)*(NEW.total_coffees-(b.reward_goal-NEW.before_stamps)-1),0
  FROM businesses b
  WHERE b.id=NEW.business_id AND ((NEW.before_stamps>=b.reward_goal)*(NEW.total_coffees-1)
    +(NEW.before_stamps<b.reward_goal)*(NEW.total_coffees-(b.reward_goal-NEW.before_stamps)-1))>0;
END;
