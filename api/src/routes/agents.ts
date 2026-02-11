import { Hono } from "hono";
import { getChainName, getNetworkChains } from "../chains.js";
import type { AppEnv } from "../env.js";

export const agentsRoutes = new Hono<AppEnv>();

// ── GET /agents — Paginated list ─────────────────────────────────────────

agentsRoutes.get("/agents", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
  const offset = (page - 1) * limit;
  const chain = c.req.query("chain");
  const network = c.req.query("network");
  const owner = c.req.query("owner");
  const sort = c.req.query("sort") === "oldest" ? "ASC" : "DESC";

  const db = c.env.DB;

  let countSql = "SELECT COUNT(DISTINCT a.master_agent_id) as cnt FROM agents a";
  let dataSql = "SELECT DISTINCT a.* FROM agents a";
  const conditions: string[] = [];
  const params: unknown[] = [];
  let needsJoin = false;

  if (chain) {
    needsJoin = true;
    conditions.push("ai.chain_id = ?");
    params.push(Number(chain));
  }

  const networkChains = getNetworkChains(network);
  if (networkChains && !chain) {
    needsJoin = true;
    const placeholders = networkChains.map(() => "?").join(",");
    conditions.push(`ai.chain_id IN (${placeholders})`);
    params.push(...networkChains);
  }

  if (needsJoin) {
    countSql += " JOIN agent_identities ai ON a.master_agent_id = ai.master_agent_id";
    dataSql += " JOIN agent_identities ai ON a.master_agent_id = ai.master_agent_id";
  }

  if (owner) {
    conditions.push("a.owner_address = ?");
    params.push(owner.toLowerCase());
  }

  if (conditions.length > 0) {
    const where = " WHERE " + conditions.join(" AND ");
    countSql += where;
    dataSql += where;
  }

  dataSql += ` ORDER BY a.created_at ${sort} LIMIT ? OFFSET ?`;

  const countRow = await db.prepare(countSql).bind(...params).first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const { results: rows } = await db.prepare(dataSql).bind(...params, limit, offset).all<AgentRow>();

  return c.json({
    agents: rows.map(formatAgentSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ── GET /agents/:id — Full profile ──────────────────────────────────────

agentsRoutes.get("/agents/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const agent = await resolveAgent(db, id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const [identitiesResult, perChainResult] = await db.batch([
    db.prepare(`SELECT * FROM agent_identities WHERE master_agent_id IN (${placeholders}) ORDER BY chain_id`).bind(...allIds),
    db.prepare(`SELECT * FROM reputation_latest WHERE master_agent_id IN (${placeholders}) ORDER BY chain_id`).bind(...allIds),
  ]);

  const identities = identitiesResult.results as unknown as IdentityRow[];
  const perChain = perChainResult.results as unknown as ReputationLatestRow[];

  return c.json({
    masterAgentId: agent.master_agent_id,
    ownerAddress: agent.owner_address,
    registeredAt: agent.registered_at,
    identities: identities.map((i) => ({
      globalAgentId: i.global_agent_id,
      chainId: i.chain_id,
      chainName: getChainName(i.chain_id),
      l2AgentId: i.l2_agent_id,
      agentUri: i.agent_uri,
      discoveredBlock: i.discovered_block,
    })),
    reputation: {
      unified: {
        value: agent.unified_value,
        decimals: agent.unified_value_decimals,
        totalFeedbackCount: agent.total_feedback_count,
      },
      perChain: perChain.map((r) => ({
        chainId: r.chain_id,
        chainName: getChainName(r.chain_id),
        summaryValue: r.summary_value,
        summaryValueDecimals: r.summary_value_decimals,
        feedbackCount: r.feedback_count,
        updatedAt: r.updated_at,
      })),
    },
  });
});

// ── GET /agents/:id/reputation — Current reputation ──────────────────────

agentsRoutes.get("/agents/:id/reputation", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const agent = await resolveAgent(db, id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const { results: perChain } = await db
    .prepare(`SELECT * FROM reputation_latest WHERE master_agent_id IN (${placeholders}) ORDER BY chain_id`)
    .bind(...allIds)
    .all<ReputationLatestRow>();

  return c.json({
    masterAgentId: agent.master_agent_id,
    unified: {
      value: agent.unified_value,
      decimals: agent.unified_value_decimals,
      totalFeedbackCount: agent.total_feedback_count,
    },
    perChain: perChain.map((r) => ({
      chainId: r.chain_id,
      chainName: getChainName(r.chain_id),
      summaryValue: r.summary_value,
      summaryValueDecimals: r.summary_value_decimals,
      feedbackCount: r.feedback_count,
      updatedAt: r.updated_at,
    })),
  });
});

// ── GET /agents/:id/reputation/history — Snapshots ───────────────────────

agentsRoutes.get("/agents/:id/reputation/history", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const agent = await resolveAgent(db, id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
  const offset = (page - 1) * limit;
  const chain = c.req.query("chain");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const conditions: string[] = [`master_agent_id IN (${placeholders})`];
  const params: unknown[] = [...allIds];

  if (chain) {
    conditions.push("chain_id = ?");
    params.push(Number(chain));
  }
  if (from) {
    conditions.push("recorded_at >= ?");
    params.push(Number(from));
  }
  if (to) {
    conditions.push("recorded_at <= ?");
    params.push(Number(to));
  }

  const where = conditions.join(" AND ");

  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM reputation_snapshots WHERE ${where}`)
    .bind(...params)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const { results: rows } = await db
    .prepare(`SELECT * FROM reputation_snapshots WHERE ${where} ORDER BY recorded_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<SnapshotRow>();

  return c.json({
    masterAgentId: agent.master_agent_id,
    snapshots: rows.map((s) => ({
      chainId: s.chain_id,
      chainName: getChainName(s.chain_id),
      summaryValue: s.summary_value,
      summaryValueDecimals: s.summary_value_decimals,
      feedbackCount: s.feedback_count,
      recordedAt: s.recorded_at,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ── GET /agents/:id/attestations — SATI attestations ─────────────────────

agentsRoutes.get("/agents/:id/attestations", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const agent = await resolveAgent(db, id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  // Check if sati_attestations table exists
  const tableCheck = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sati_attestations'")
    .first<{ name: string }>();

  if (!tableCheck) {
    return c.json({
      masterAgentId: agent.master_agent_id,
      attestations: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
  }

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM sati_attestations WHERE master_agent_id IN (${placeholders})`)
    .bind(...allIds)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const { results: rows } = await db
    .prepare(`SELECT * FROM sati_attestations WHERE master_agent_id IN (${placeholders}) ORDER BY slot DESC LIMIT ? OFFSET ?`)
    .bind(...allIds, limit, offset)
    .all<SatiAttestationRow>();

  const outcomeLabels: Record<number, string> = { 0: "negative", 1: "neutral", 2: "positive" };

  return c.json({
    masterAgentId: agent.master_agent_id,
    attestations: rows.map((a) => ({
      attestationAddress: a.attestation_address,
      counterparty: a.counterparty,
      outcome: outcomeLabels[a.outcome] || `unknown(${a.outcome})`,
      slot: a.slot,
      txSignature: a.tx_signature,
      createdAt: a.created_at,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentRow {
  master_agent_id: string;
  owner_address: string;
  registered_at: number;
  first_seen_block: number | null;
  first_seen_chain: number | null;
  unified_value: string;
  unified_value_decimals: number;
  total_feedback_count: string;
  created_at: number;
  updated_at: number;
}

interface IdentityRow {
  id: number;
  master_agent_id: string;
  global_agent_id: string;
  chain_id: number;
  registry_address: string;
  l2_agent_id: string;
  agent_uri: string | null;
  discovered_block: number;
  created_at: number;
}

interface ReputationLatestRow {
  master_agent_id: string;
  chain_id: number;
  summary_value: string;
  summary_value_decimals: number;
  feedback_count: string;
  updated_at: number;
}

interface SnapshotRow {
  id: number;
  master_agent_id: string;
  chain_id: number;
  summary_value: string;
  summary_value_decimals: number;
  feedback_count: string;
  recorded_at: number;
}

interface SatiAttestationRow {
  id: number;
  master_agent_id: string;
  attestation_address: string;
  counterparty: string;
  outcome: number;
  slot: number;
  tx_signature: string;
  created_at: number;
}

// ── Exported helpers (async D1) ──────────────────────────────────────────

/**
 * Resolve an agent, following wallet_links if the resolved agent is a linked (secondary).
 */
export async function resolveAgent(db: D1Database, id: string): Promise<AgentRow | null> {
  const agent = await resolveAgentDirect(db, id);
  if (!agent) return null;

  const link = await db
    .prepare("SELECT primary_agent_id FROM wallet_links WHERE linked_agent_id = ?")
    .bind(agent.master_agent_id)
    .first<{ primary_agent_id: string }>();

  if (link) {
    return db
      .prepare("SELECT * FROM agents WHERE master_agent_id = ?")
      .bind(link.primary_agent_id)
      .first<AgentRow>();
  }

  return agent;
}

async function resolveAgentDirect(db: D1Database, id: string): Promise<AgentRow | null> {
  if (id.startsWith("0x") && id.length === 66) {
    return db.prepare("SELECT * FROM agents WHERE master_agent_id = ?").bind(id).first<AgentRow>();
  }

  if (id.startsWith("eip155:") || id.startsWith("solana:")) {
    const identity = await db
      .prepare("SELECT master_agent_id FROM agent_identities WHERE global_agent_id = ?")
      .bind(id)
      .first<{ master_agent_id: string }>();
    if (!identity) return null;
    return db.prepare("SELECT * FROM agents WHERE master_agent_id = ?").bind(identity.master_agent_id).first<AgentRow>();
  }

  if (id.startsWith("0x") && id.length === 42) {
    return db.prepare("SELECT * FROM agents WHERE owner_address = ?").bind(id.toLowerCase()).first<AgentRow>();
  }

  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return db.prepare("SELECT * FROM agents WHERE owner_address = ?").bind(id).first<AgentRow>();
  }

  // Check address_claims as fallback
  const claim = await db
    .prepare("SELECT master_agent_id FROM address_claims WHERE address = ?")
    .bind(id.startsWith("0x") ? id.toLowerCase() : id)
    .first<{ master_agent_id: string }>();
  if (claim) {
    return db.prepare("SELECT * FROM agents WHERE master_agent_id = ?").bind(claim.master_agent_id).first<AgentRow>();
  }

  return null;
}

/**
 * Get all agent IDs in a link group (primary + all linked secondaries).
 */
export async function getAllLinkedIds(db: D1Database, primaryId: string): Promise<string[]> {
  const { results: links } = await db
    .prepare("SELECT linked_agent_id FROM wallet_links WHERE primary_agent_id = ?")
    .bind(primaryId)
    .all<{ linked_agent_id: string }>();
  return [primaryId, ...links.map((l) => l.linked_agent_id)];
}

function formatAgentSummary(row: AgentRow) {
  return {
    masterAgentId: row.master_agent_id,
    ownerAddress: row.owner_address,
    registeredAt: row.registered_at,
    unifiedValue: row.unified_value,
    unifiedValueDecimals: row.unified_value_decimals,
    totalFeedbackCount: row.total_feedback_count,
  };
}
