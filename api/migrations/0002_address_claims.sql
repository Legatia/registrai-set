CREATE TABLE IF NOT EXISTS address_claims (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  master_agent_id TEXT NOT NULL REFERENCES agents(master_agent_id),
  address         TEXT NOT NULL,
  chain_type      TEXT NOT NULL CHECK (chain_type IN ('evm', 'solana')),
  chain_id        INTEGER,
  verified_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(address, chain_type)
);
CREATE INDEX IF NOT EXISTS idx_address_claims_agent ON address_claims(master_agent_id);
CREATE INDEX IF NOT EXISTS idx_address_claims_address ON address_claims(address);
