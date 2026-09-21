-- Additive: preserve legacy styles and all existing cards/QRs.
CREATE TABLE loyalty_card_preferences (
 card_id TEXT PRIMARY KEY REFERENCES loyalty_cards(id) ON DELETE CASCADE,
 business_id TEXT NOT NULL REFERENCES businesses(id),
 stamp_style TEXT NOT NULL DEFAULT 'classic'
);
CREATE INDEX card_preferences_business ON loyalty_card_preferences(business_id);
CREATE TRIGGER card_preferences_tenant_insert BEFORE INSERT ON loyalty_card_preferences
WHEN NOT EXISTS (SELECT 1 FROM loyalty_cards WHERE id=NEW.card_id AND business_id=NEW.business_id)
BEGIN SELECT RAISE(ABORT,'card_preference_tenant_mismatch'); END;
CREATE TRIGGER card_preferences_tenant_update BEFORE UPDATE ON loyalty_card_preferences
WHEN NOT EXISTS (SELECT 1 FROM loyalty_cards WHERE id=NEW.card_id AND business_id=NEW.business_id)
BEGIN SELECT RAISE(ABORT,'card_preference_tenant_mismatch'); END;
INSERT INTO loyalty_card_preferences(card_id,business_id,stamp_style)
SELECT id,business_id,stamp_style FROM loyalty_cards;
