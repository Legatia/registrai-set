-- Track frontend-submitted registration txs before relayer/indexer confirmation
CREATE TABLE IF NOT EXISTS registration_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  agent_uri TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted | indexed | failed
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(chain_id, tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_registration_submissions_wallet
  ON registration_submissions(wallet_address, created_at DESC);
