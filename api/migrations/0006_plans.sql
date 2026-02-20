-- Pricing plans and developer plan assignments
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_interval TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly | custom
  total_per_day INTEGER NOT NULL,
  write_per_day INTEGER NOT NULL,
  feedback_submit_per_day INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS developer_plan_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_id TEXT NOT NULL REFERENCES developers(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  starts_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ends_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_developer_plan_assignments_developer
  ON developer_plan_assignments(developer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_developer_plan_assignments_active
  ON developer_plan_assignments(developer_id, ends_at);
