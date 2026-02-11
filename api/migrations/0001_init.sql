-- RegistrAI KYA — D1 schema
-- Includes relayer tables + API tables

-- ── Relayer tables ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  master_agent_id        TEXT PRIMARY KEY,
  owner_address          TEXT NOT NULL,
  registered_at          INTEGER NOT NULL DEFAULT 0,
  first_seen_block       INTEGER,
  first_seen_chain       INTEGER,
  unified_value          TEXT NOT NULL DEFAULT '0',
  unified_value_decimals INTEGER NOT NULL DEFAULT 0,
  total_feedback_count   TEXT NOT NULL DEFAULT '0',
  created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_address);
CREATE INDEX IF NOT EXISTS idx_agents_created ON agents(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_identities (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  master_agent_id   TEXT NOT NULL REFERENCES agents(master_agent_id),
  global_agent_id   TEXT NOT NULL UNIQUE,
  chain_id          INTEGER NOT NULL,
  registry_address  TEXT NOT NULL,
  l2_agent_id       TEXT NOT NULL,
  agent_uri         TEXT,
  discovered_block  INTEGER NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_identities_master ON agent_identities(master_agent_id);
CREATE INDEX IF NOT EXISTS idx_identities_chain ON agent_identities(chain_id);
CREATE INDEX IF NOT EXISTS idx_identities_chain_l2 ON agent_identities(chain_id, l2_agent_id);

CREATE TABLE IF NOT EXISTS reputation_latest (
  master_agent_id        TEXT NOT NULL REFERENCES agents(master_agent_id),
  chain_id               INTEGER NOT NULL,
  summary_value          TEXT NOT NULL,
  summary_value_decimals INTEGER NOT NULL,
  feedback_count         TEXT NOT NULL,
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (master_agent_id, chain_id)
);

CREATE TABLE IF NOT EXISTS reputation_snapshots (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  master_agent_id        TEXT NOT NULL REFERENCES agents(master_agent_id),
  chain_id               INTEGER NOT NULL,
  summary_value          TEXT NOT NULL,
  summary_value_decimals INTEGER NOT NULL,
  feedback_count         TEXT NOT NULL,
  recorded_at            INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_snapshots_agent_chain_time ON reputation_snapshots(master_agent_id, chain_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS sync_cursors (
  chain_id       INTEGER PRIMARY KEY,
  last_block     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  last_signature TEXT
);

CREATE TABLE IF NOT EXISTS sati_attestations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  master_agent_id     TEXT NOT NULL REFERENCES agents(master_agent_id),
  attestation_address TEXT NOT NULL UNIQUE,
  counterparty        TEXT NOT NULL,
  outcome             INTEGER NOT NULL,
  slot                INTEGER NOT NULL,
  tx_signature        TEXT NOT NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sati_att_agent ON sati_attestations(master_agent_id);

CREATE TABLE IF NOT EXISTS evm_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  master_agent_id TEXT NOT NULL REFERENCES agents(master_agent_id),
  evm_address     TEXT NOT NULL,
  evm_chain_id    INTEGER NOT NULL,
  linked_at       INTEGER NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_evm_links_agent ON evm_links(master_agent_id);
CREATE INDEX IF NOT EXISTS idx_evm_links_address ON evm_links(evm_address);

-- ── API tables ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_links (
  primary_agent_id   TEXT NOT NULL,
  linked_agent_id    TEXT NOT NULL,
  solana_address     TEXT,
  evm_address        TEXT,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (linked_agent_id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_links_primary ON wallet_links(primary_agent_id);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  master_agent_id    TEXT NOT NULL,
  chain_id           INTEGER NOT NULL,
  commenter_address  TEXT NOT NULL,
  score              INTEGER NOT NULL,
  tag                TEXT NOT NULL DEFAULT '',
  comment_text       TEXT NOT NULL DEFAULT '',
  comment_hash       TEXT NOT NULL,
  tx_hash            TEXT,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_feedback_agent ON feedback_comments(master_agent_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_limit ON feedback_comments(master_agent_id, commenter_address, created_at);

-- ── Developer portal ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS developers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS api_keys (
  key         TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES developers(id),
  label       TEXT NOT NULL DEFAULT '',
  scopes      TEXT NOT NULL DEFAULT 'read,write',
  revoked_at  INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_api_keys_dev ON api_keys(developer_id);

CREATE TABLE IF NOT EXISTS api_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key     TEXT NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage(api_key, recorded_at);

-- ── Webhooks ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
  id            TEXT PRIMARY KEY,
  developer_id  TEXT NOT NULL REFERENCES developers(id),
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,
  events        TEXT NOT NULL,
  agent_id      TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_webhooks_dev ON webhooks(developer_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id    TEXT NOT NULL REFERENCES webhooks(id),
  event         TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status_code   INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  delivered_at  INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON webhook_deliveries(next_retry_at)
  WHERE status_code IS NULL;
