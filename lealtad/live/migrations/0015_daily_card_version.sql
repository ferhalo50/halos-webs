-- Forward-only, no row rewrite. Reuse the existing version for daily balance changes.
-- Per-item cards already increment this version in their reward/normalization triggers.
CREATE TRIGGER version_daily_card_balance
AFTER UPDATE OF stamps,redeemed_count ON loyalty_cards
WHEN NEW.reward_version=OLD.reward_version
 AND (NEW.stamps<>OLD.stamps OR NEW.redeemed_count<>OLD.redeemed_count)
 AND (SELECT stamp_policy FROM businesses WHERE id=NEW.business_id)='daily'
BEGIN
 UPDATE loyalty_cards SET reward_version=reward_version+1 WHERE id=NEW.id AND business_id=NEW.business_id;
END;
