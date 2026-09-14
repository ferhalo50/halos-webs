CREATE INDEX IF NOT EXISTS users_business_role_created
  ON users(business_id, role, created_at DESC);

CREATE INDEX IF NOT EXISTS loyalty_cards_business_stamps
  ON loyalty_cards(business_id, stamps);

CREATE INDEX IF NOT EXISTS loyalty_events_business_type_day
  ON loyalty_events(business_id, event_type, business_day);

CREATE INDEX IF NOT EXISTS loyalty_events_card_type_created
  ON loyalty_events(card_id, event_type, created_at DESC);
