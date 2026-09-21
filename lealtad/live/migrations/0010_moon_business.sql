-- Business configuration only; no credentials or demo users.
INSERT INTO businesses(id,slug,name,reward_goal,reward_name,timezone,active)
VALUES('business_mooncoffee','mooncoffee','MOON Coffee',8,'Bebida gratis','America/Tijuana',1)
ON CONFLICT(slug) DO NOTHING;
