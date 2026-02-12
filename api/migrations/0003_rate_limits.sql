CREATE TABLE IF NOT EXISTS rate_limits (
  id           TEXT PRIMARY KEY,
  scope_type   TEXT NOT NULL CHECK (scope_type IN ('api_key', 'ip')),
  scope_key    TEXT NOT NULL,
  bucket       TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_scope_bucket_window
  ON rate_limits(scope_type, scope_key, bucket, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at
  ON rate_limits(updated_at);
