PRAGMA foreign_keys = ON;

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  reward_goal INTEGER NOT NULL DEFAULT 9 CHECK (reward_goal BETWEEN 1 AND 99),
  reward_name TEXT NOT NULL DEFAULT 'Café gratis',
  timezone TEXT NOT NULL DEFAULT 'America/Tijuana',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  role TEXT NOT NULL CHECK (role IN ('customer', 'employee', 'admin')),
  name TEXT NOT NULL,
  phone TEXT,
  username TEXT,
  secret_hash TEXT NOT NULL,
  secret_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_business_phone_unique ON users(business_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX users_business_username_unique ON users(business_id, username) WHERE username IS NOT NULL;

CREATE TABLE loyalty_cards (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  customer_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  qr_token TEXT NOT NULL UNIQUE,
  stamps INTEGER NOT NULL DEFAULT 0 CHECK (stamps >= 0),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE loyalty_events (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  employee_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('stamp', 'redeem')),
  business_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata TEXT
);

CREATE UNIQUE INDEX one_stamp_per_business_day
  ON loyalty_events(card_id, business_day)
  WHERE event_type = 'stamp';
CREATE INDEX loyalty_events_business_created ON loyalty_events(business_id, created_at DESC);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE login_attempts (
  login_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO businesses (id, slug, name, reward_goal, reward_name, timezone)
VALUES ('business_renace', 'renace', 'Renace Café Shop', 9, 'Café gratis', 'America/Tijuana');
