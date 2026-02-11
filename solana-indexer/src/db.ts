
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

export function initDatabase(cfg: any): void {
  // If cfg is a string (legacy file path), we can't use it. Expect object.
  if (typeof cfg === 'string') {
     throw new Error("initDatabase expects D1Config object, not filepath");
  }
  config = cfg as D1Config;
  log.info(`D1 database configured: ${config.databaseId}`);
}

export function getDb(): any {
  // Return dummy object to satisfy legacy calls if any, but we favor direct functions
  return { prepare: () => { throw new Error("Use exported async functions instead of synchronous prepare()"); } };
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

// ── Data Access Functions ───────────────────────────────────────────────

export async function upsertAgent(
  masterAgentId: string,
  ownerAddress: string,
  firstSeenSlot: number | null,
  firstSeenChain: number | null
): Promise<void> {
  await execute(
    `INSERT INTO agents (master_agent_id, owner_address, registered_at, first_seen_block, first_seen_chain)
     VALUES (?, ?, unixepoch(), ?, ?)
     ON CONFLICT(master_agent_id) DO UPDATE SET
       updated_at = unixepoch()`,
    [masterAgentId, ownerAddress, firstSeenSlot, firstSeenChain]
  );
}

export async function insertIdentity(
  masterAgentId: string,
  globalAgentId: string,
  chainId: number,
  registryAddress: string,
  l2AgentId: string,
  agentUri: string | null,
  discoveredSlot: number
): Promise<void> {
  await execute(
    `INSERT INTO agent_identities (master_agent_id, global_agent_id, chain_id, registry_address, l2_agent_id, agent_uri, discovered_block)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(global_agent_id) DO UPDATE SET
       agent_uri = COALESCE(excluded.agent_uri, agent_identities.agent_uri)`,
    [masterAgentId, globalAgentId, chainId, registryAddress, l2AgentId, agentUri, discoveredSlot]
  );
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

export async function insertReputationSnapshot(
  masterAgentId: string,
  chainId: number,
  summaryValue: string,
  summaryValueDecimals: number,
  feedbackCount: string
): Promise<boolean> {
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

  await execute(
    `INSERT INTO reputation_snapshots (master_agent_id, chain_id, summary_value, summary_value_decimals, feedback_count)
     VALUES (?, ?, ?, ?, ?)`,
    [masterAgentId, chainId, summaryValue, summaryValueDecimals, feedbackCount]
  );

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

export async function upsertSyncCursorWithSignature(
  chainId: number,
  lastSlot: number,
  lastSignature: string
): Promise<void> {
  await execute(
    `INSERT INTO sync_cursors (chain_id, last_block, last_signature)
     VALUES (?, ?, ?)
     ON CONFLICT(chain_id) DO UPDATE SET
       last_block = excluded.last_block,
       last_signature = excluded.last_signature,
       updated_at = unixepoch()`,
    [chainId, lastSlot, lastSignature]
  );
}

export async function getSyncCursor(chainId: number): Promise<{ last_block: number; last_signature: string | null } | undefined> {
  return queryFirst<{ last_block: number; last_signature: string | null }>(
    `SELECT last_block, last_signature FROM sync_cursors WHERE chain_id = ?`,
    [chainId]
  );
}

export async function insertSatiAttestation(
  masterAgentId: string,
  attestationAddress: string,
  counterparty: string,
  outcome: number,
  slot: number,
  txSignature: string
): Promise<boolean> {
  try {
    await execute(
      `INSERT INTO sati_attestations (master_agent_id, attestation_address, counterparty, outcome, slot, tx_signature)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [masterAgentId, attestationAddress, counterparty, outcome, slot, txSignature]
    );
    return true;
  } catch (err: unknown) {
    // D1 error messages vary, but usually contain constraint violation info
    if (err instanceof Error && (err.message.includes("UNIQUE constraint") || err.message.includes("constraint failed"))) {
      return false;
    }
    throw err;
  }
}

export async function insertEvmLink(
  masterAgentId: string,
  evmAddress: string,
  evmChainId: number,
  linkedAt: number
): Promise<void> {
  await execute(
    `INSERT OR IGNORE INTO evm_links (master_agent_id, evm_address, evm_chain_id, linked_at)
     VALUES (?, ?, ?, ?)`,
    [masterAgentId, evmAddress.toLowerCase(), evmChainId, linkedAt]
  );
}

export async function getAttestationCount(masterAgentId: string): Promise<number> {
  const row = await queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM sati_attestations WHERE master_agent_id = ?`,
    [masterAgentId]
  );
  return row?.cnt ?? 0;
}

export async function getAttestationOutcomeCounts(masterAgentId: string): Promise<{ positive: number; neutral: number; negative: number }> {
  const rows = await queryAll<{ outcome: number; cnt: number }>(
    `SELECT outcome, COUNT(*) as cnt FROM sati_attestations WHERE master_agent_id = ? GROUP BY outcome`,
    [masterAgentId]
  );

  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const row of rows) {
    if (row.outcome === 2) counts.positive = row.cnt;
    else if (row.outcome === 1) counts.neutral = row.cnt;
    else if (row.outcome === 0) counts.negative = row.cnt;
  }
  return counts;
}

export function closeDatabase(): void {
  // No-op for D1
}
