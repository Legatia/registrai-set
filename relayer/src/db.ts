import { log } from "./logger.js";

// ── D1 HTTP API Client ────────────────────────────────────────────────────

interface D1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

interface D1Result {
  results: Record<string, unknown>[];
  success: boolean;
  meta: { changes: number; last_row_id: number; rows_read: number; rows_written: number };
}

interface D1Response {
  result: D1Result[];
  success: boolean;
  errors: { code: number; message: string }[];
}

let config: D1Config;

export function initDatabase(cfg: D1Config): void {
  config = cfg;
  log.info(`D1 database configured: ${cfg.databaseId}`);
}

function getConfig(): D1Config {
  if (!config) throw new Error("Database not initialized — call initDatabase() first");
  return config;
}

/**
 * Execute a single SQL statement against D1 via the REST API.
 */
async function d1Query(sql: string, params: unknown[] = []): Promise<D1Result> {
  const cfg = getConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as D1Response;
  if (!json.success) {
    throw new Error(`D1 query failed: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  return json.result[0];
}

/**
 * Execute multiple SQL statements in a batch (single HTTP call).
 */
async function d1Batch(stmts: { sql: string; params: unknown[] }[]): Promise<D1Result[]> {
  const cfg = getConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ batch: stmts }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 batch API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as D1Response;
  if (!json.success) {
    throw new Error(`D1 batch failed: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  return json.result;
}

// ── Query helpers ─────────────────────────────────────────────────────────

export async function queryFirst<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await d1Query(sql, params);
  return result.results[0] as T | undefined;
}

export async function queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await d1Query(sql, params);
  return result.results as T[];
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  await d1Query(sql, params);
}

export async function executeBatch(stmts: { sql: string; params: unknown[] }[]): Promise<void> {
  if (stmts.length === 0) return;
  await d1Batch(stmts);
}

export function buildUpsertAgentStmt(
  masterAgentId: string,
  ownerAddress: string,
  firstSeenBlock: number | null,
  firstSeenChain: number | null
): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO agents (master_agent_id, owner_address, registered_at, first_seen_block, first_seen_chain)
          VALUES (?, ?, unixepoch(), ?, ?)
          ON CONFLICT(master_agent_id) DO UPDATE SET
            updated_at = unixepoch()`,
    params: [masterAgentId, ownerAddress.toLowerCase(), firstSeenBlock, firstSeenChain],
  };
}

export function buildInsertIdentityStmt(
  masterAgentId: string,
  globalAgentId: string,
  chainId: number,
  registryAddress: string,
  l2AgentId: string,
  agentUri: string | null,
  discoveredBlock: number
): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO agent_identities (master_agent_id, global_agent_id, chain_id, registry_address, l2_agent_id, agent_uri, discovered_block)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(global_agent_id) DO UPDATE SET
            agent_uri = COALESCE(excluded.agent_uri, agent_identities.agent_uri)`,
    params: [masterAgentId, globalAgentId, chainId, registryAddress.toLowerCase(), l2AgentId, agentUri, discoveredBlock],
  };
}

// ── Prepared statement wrappers ──────────────────────────────────────────

export async function upsertAgent(
  masterAgentId: string,
  ownerAddress: string,
  firstSeenBlock: number | null,
  firstSeenChain: number | null
): Promise<void> {
  const stmt = buildUpsertAgentStmt(masterAgentId, ownerAddress, firstSeenBlock, firstSeenChain);
  await execute(stmt.sql, stmt.params);
}

export async function insertIdentity(
  masterAgentId: string,
  globalAgentId: string,
  chainId: number,
  registryAddress: string,
  l2AgentId: string,
  agentUri: string | null,
  discoveredBlock: number
): Promise<void> {
  const stmt = buildInsertIdentityStmt(
    masterAgentId,
    globalAgentId,
    chainId,
    registryAddress,
    l2AgentId,
    agentUri,
    discoveredBlock
  );
  await execute(stmt.sql, stmt.params);
}

export async function upsertReputationLatest(
  masterAgentId: string,
  chainId: number,
  summaryValue: string,
  summaryValueDecimals: number,
  feedbackCount: string
): Promise<void> {
  await execute(
    `INSERT INTO reputation_latest (master_agent_id, chain_id, summary_value, summary_value_decimals, feedback_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(master_agent_id, chain_id) DO UPDATE SET
       summary_value = excluded.summary_value,
       summary_value_decimals = excluded.summary_value_decimals,
       feedback_count = excluded.feedback_count,
       updated_at = unixepoch()`,
    [masterAgentId, chainId, summaryValue, summaryValueDecimals, feedbackCount]
  );
}

export function buildReputationSnapshotStmt(
  masterAgentId: string,
  chainId: number,
  summaryValue: string,
  summaryValueDecimals: number,
  feedbackCount: string
): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO reputation_snapshots (master_agent_id, chain_id, summary_value, summary_value_decimals, feedback_count)
          VALUES (?, ?, ?, ?, ?)`,
    params: [masterAgentId, chainId, summaryValue, summaryValueDecimals, feedbackCount],
  };
}

export function buildReputationLatestStmt(
  masterAgentId: string,
  chainId: number,
  summaryValue: string,
  summaryValueDecimals: number,
  feedbackCount: string
): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO reputation_latest (master_agent_id, chain_id, summary_value, summary_value_decimals, feedback_count)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(master_agent_id, chain_id) DO UPDATE SET
            summary_value = excluded.summary_value,
            summary_value_decimals = excluded.summary_value_decimals,
            feedback_count = excluded.feedback_count,
            updated_at = unixepoch()`,
    params: [masterAgentId, chainId, summaryValue, summaryValueDecimals, feedbackCount],
  };
}

/**
 * Insert a snapshot only if values differ from the most recent one for this (agent, chain).
 */
export async function insertReputationSnapshot(
  masterAgentId: string,
  chainId: number,
  summaryValue: string,
  summaryValueDecimals: number,
  feedbackCount: string
): Promise<boolean> {
  // Check if agent exists to verify foreign key constraint
  const agentExists = await queryFirst<{ x: number }>(
    "SELECT 1 as x FROM agents WHERE master_agent_id = ?",
    [masterAgentId]
  );

  if (!agentExists) {
    log.warn(`Skipping reputation snapshot for missing agent: ${masterAgentId}`);
    return false;
  }

  const latest = await queryFirst<{
    summary_value: string;
    summary_value_decimals: number;
    feedback_count: string;
  }>(
    `SELECT summary_value, summary_value_decimals, feedback_count
     FROM reputation_snapshots
     WHERE master_agent_id = ? AND chain_id = ?
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [masterAgentId, chainId]
  );

  if (
    latest &&
    latest.summary_value === summaryValue &&
    latest.summary_value_decimals === summaryValueDecimals &&
    latest.feedback_count === feedbackCount
  ) {
    return false;
  }

  const stmt = buildReputationSnapshotStmt(masterAgentId, chainId, summaryValue, summaryValueDecimals, feedbackCount);
  await execute(stmt.sql, stmt.params);
  return true;
}

export async function updateUnifiedReputation(
  masterAgentId: string,
  unifiedValue: string,
  unifiedDecimals: number,
  totalFeedbackCount: string
): Promise<void> {
  await execute(
    `UPDATE agents
     SET unified_value = ?, unified_value_decimals = ?, total_feedback_count = ?, updated_at = unixepoch()
     WHERE master_agent_id = ?`,
    [unifiedValue, unifiedDecimals, totalFeedbackCount, masterAgentId]
  );
}

export async function updateSyncCursor(chainId: number, lastBlock: number): Promise<void> {
  await execute(
    `INSERT INTO sync_cursors (chain_id, last_block)
     VALUES (?, ?)
     ON CONFLICT(chain_id) DO UPDATE SET
       last_block = excluded.last_block,
       updated_at = unixepoch()`,
    [chainId, lastBlock]
  );
}

export function closeDatabase(): void {
  // No-op for D1 HTTP — no persistent connection to close
  log.info("D1 connection closed (no-op for HTTP API)");
}
