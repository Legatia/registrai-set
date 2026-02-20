-- Billing and metered-usage primitives
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'manual',
  external_subscription_id TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL, -- developer | organization
  owner_id TEXT NOT NULL,
  plan_id TEXT REFERENCES plans(id),
  status TEXT NOT NULL, -- active | trialing | past_due | canceled | incomplete
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  billing_interval TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly | custom
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_type, owner_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id);

CREATE TABLE IF NOT EXISTS billing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  processed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider ON billing_events(provider, created_at DESC);
