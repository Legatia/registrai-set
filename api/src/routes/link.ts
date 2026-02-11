import { Hono } from "hono";
import { ethers } from "ethers";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import bs58 from "bs58";
import type { AppEnv } from "../env.js";
import { enqueueEvent } from "../webhooks/dispatcher.js";

// @noble/ed25519 v2 requires sha512 to be configured
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export const linkRoutes = new Hono<AppEnv>();

// ── Types ────────────────────────────────────────────────────────────────

interface AgentRow {
  master_agent_id: string;
  owner_address: string;
  created_at: number;
}

interface WalletLinkRow {
  primary_agent_id: string;
  linked_agent_id: string;
  solana_address: string | null;
  evm_address: string | null;
  created_at: number;
}

interface ReputationLatestRow {
  master_agent_id: string;
  chain_id: number;
  summary_value: string;
  summary_value_decimals: number;
  feedback_count: string;
}

// ── POST /agents/link ────────────────────────────────────────────────────

linkRoutes.post("/agents/link", async (c) => {
  let body: { solanaAddress: string; evmAddress: string; solanaSignature: string; evmSignature: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { solanaAddress, evmAddress, solanaSignature, evmSignature } = body;

  if (!solanaAddress || !evmAddress || !solanaSignature || !evmSignature) {
    return c.json({ error: "Missing required fields: solanaAddress, evmAddress, solanaSignature, evmSignature" }, 400);
  }

  // 1. Verify EVM signature: signs "KYA Link: <solanaAddress>"
  const evmMessage = `KYA Link: ${solanaAddress}`;
  let recoveredEvm: string;
  try {
    recoveredEvm = ethers.verifyMessage(evmMessage, evmSignature);
  } catch {
    return c.json({ error: "Invalid EVM signature" }, 401);
  }
  if (recoveredEvm.toLowerCase() !== evmAddress.toLowerCase()) {
    return c.json({ error: "EVM signature does not match evmAddress" }, 401);
  }

  // 2. Verify Solana signature: signs "KYA Link: <evmAddress>"
  const solanaMessage = `KYA Link: ${evmAddress}`;
  const msgBytes = new TextEncoder().encode(solanaMessage);
  let sigBytes: Uint8Array;
  let pubkeyBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(solanaSignature);
    pubkeyBytes = bs58.decode(solanaAddress);
  } catch {
    return c.json({ error: "Invalid base58 encoding for Solana signature or address" }, 400);
  }

  let solanaValid: boolean;
  try {
    solanaValid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
  } catch {
    return c.json({ error: "Invalid Solana signature or key format" }, 401);
  }
  if (!solanaValid) {
    return c.json({ error: "Invalid Solana signature" }, 401);
  }

  // 3. Look up both agents by owner_address
  const db = c.env.DB;
  const evmAgent = await db
    .prepare("SELECT master_agent_id, owner_address, created_at FROM agents WHERE owner_address = ?")
    .bind(evmAddress.toLowerCase())
    .first<AgentRow>();
  const solanaAgent = await db
    .prepare("SELECT master_agent_id, owner_address, created_at FROM agents WHERE owner_address = ?")
    .bind(solanaAddress)
    .first<AgentRow>();

  if (!evmAgent || !solanaAgent) {
    return c.json({ error: "One or both agents not found" }, 404);
  }

  if (evmAgent.master_agent_id === solanaAgent.master_agent_id) {
    return c.json({ error: "Both addresses belong to the same agent" }, 409);
  }

  // 4-7. Check-and-insert using D1 batch
  const [primary, linked] =
    evmAgent.created_at <= solanaAgent.created_at
      ? [evmAgent, solanaAgent]
      : [solanaAgent, evmAgent];

  // Check neither is already linked (outside batch since we need the result)
  const existingLink = await db
    .prepare("SELECT 1 FROM wallet_links WHERE linked_agent_id IN (?, ?) OR primary_agent_id IN (?, ?)")
    .bind(evmAgent.master_agent_id, solanaAgent.master_agent_id, evmAgent.master_agent_id, solanaAgent.master_agent_id)
    .first();

  if (existingLink) {
    return c.json({ error: "One or both agents are already linked" }, 409);
  }

  // Build the INSERT statement
  const insertStmt = db
    .prepare("INSERT INTO wallet_links (primary_agent_id, linked_agent_id, solana_address, evm_address) VALUES (?, ?, ?, ?)")
    .bind(primary.master_agent_id, linked.master_agent_id, solanaAddress, evmAddress.toLowerCase());

  // Build the reputation UPDATE statements for the primary
  const updateStmts = await buildReputationUpdateStmts(db, primary.master_agent_id);

  try {
    await db.batch([insertStmt, ...updateStmts]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      return c.json({ error: "One or both agents are already linked" }, 409);
    }
    throw err;
  }

  enqueueEvent(db, "link.created", primary.master_agent_id, {
    linkedAgentId: linked.master_agent_id,
    solanaAddress,
    evmAddress: evmAddress.toLowerCase(),
  });

  // Return merged profile
  const updatedAgent = await db
    .prepare("SELECT * FROM agents WHERE master_agent_id = ?")
    .bind(primary.master_agent_id)
    .first<AgentRow & {
      unified_value: string;
      unified_value_decimals: number;
      total_feedback_count: string;
    }>();

  return c.json({
    primaryAgentId: primary.master_agent_id,
    linkedAgentId: linked.master_agent_id,
    solanaAddress,
    evmAddress: evmAddress.toLowerCase(),
    unifiedValue: updatedAgent?.unified_value,
    unifiedValueDecimals: updatedAgent?.unified_value_decimals,
    totalFeedbackCount: updatedAgent?.total_feedback_count,
  }, 201);
});

// ── GET /agents/:id/links ────────────────────────────────────────────────

linkRoutes.get("/agents/:id/links", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const agent = await findAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  // Check if this agent is a primary
  const linkedRows = (await db
    .prepare("SELECT * FROM wallet_links WHERE primary_agent_id = ?")
    .bind(agent.master_agent_id)
    .all<WalletLinkRow>()).results;

  if (linkedRows.length > 0) {
    return c.json({
      masterAgentId: agent.master_agent_id,
      role: "primary",
      links: linkedRows.map((l) => ({
        linkedAgentId: l.linked_agent_id,
        solanaAddress: l.solana_address,
        evmAddress: l.evm_address,
        createdAt: l.created_at,
      })),
    });
  }

  // Check if this agent is a linked (secondary)
  const asLinked = await db
    .prepare("SELECT * FROM wallet_links WHERE linked_agent_id = ?")
    .bind(agent.master_agent_id)
    .first<WalletLinkRow>();

  if (asLinked) {
    return c.json({
      masterAgentId: agent.master_agent_id,
      role: "linked",
      primaryAgentId: asLinked.primary_agent_id,
      solanaAddress: asLinked.solana_address,
      evmAddress: asLinked.evm_address,
      createdAt: asLinked.created_at,
    });
  }

  return c.json({
    masterAgentId: agent.master_agent_id,
    role: "none",
    links: [],
  });
});

// ── DELETE /agents/:id/links ─────────────────────────────────────────────

linkRoutes.delete("/agents/:id/links", async (c) => {
  const id = c.req.param("id");
  let body: { signature: string; signerAddress: string; chain: "evm" | "solana" };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { signature, signerAddress, chain } = body;

  if (!signature || !signerAddress || !chain) {
    return c.json({ error: "Missing required fields: signature, signerAddress, chain" }, 400);
  }

  const db = c.env.DB;
  const agent = await findAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  // Find the link where this agent is the primary
  const link = await db
    .prepare("SELECT * FROM wallet_links WHERE primary_agent_id = ?")
    .bind(agent.master_agent_id)
    .first<WalletLinkRow>();

  // Or where this agent is the linked
  const linkAsSecondary = await db
    .prepare("SELECT * FROM wallet_links WHERE linked_agent_id = ?")
    .bind(agent.master_agent_id)
    .first<WalletLinkRow>();

  const activeLink = link || linkAsSecondary;
  if (!activeLink) {
    return c.json({ error: "No active link found for this agent" }, 404);
  }

  // Verify signature proves ownership: signs "KYA Unlink: <primaryAgentId>"
  const unlinkMessage = `KYA Unlink: ${activeLink.primary_agent_id}`;

  if (chain === "evm") {
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(unlinkMessage, signature);
    } catch {
      return c.json({ error: "Invalid EVM signature" }, 401);
    }
    if (recovered.toLowerCase() !== signerAddress.toLowerCase()) {
      return c.json({ error: "EVM signature does not match signerAddress" }, 401);
    }
    // Must be the evm_address on the link or the primary's owner
    const primaryAgent = await db
      .prepare("SELECT owner_address FROM agents WHERE master_agent_id = ?")
      .bind(activeLink.primary_agent_id)
      .first<{ owner_address: string }>();
    if (
      signerAddress.toLowerCase() !== activeLink.evm_address?.toLowerCase() &&
      signerAddress.toLowerCase() !== primaryAgent?.owner_address?.toLowerCase()
    ) {
      return c.json({ error: "Signer is not authorized to unlink" }, 403);
    }
  } else if (chain === "solana") {
    const msgBytes = new TextEncoder().encode(unlinkMessage);
    let sigBytes: Uint8Array;
    let pubkeyBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signature);
      pubkeyBytes = bs58.decode(signerAddress);
    } catch {
      return c.json({ error: "Invalid base58 encoding" }, 400);
    }
    let valid: boolean;
    try {
      valid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
    } catch {
      return c.json({ error: "Invalid Solana signature or key format" }, 401);
    }
    if (!valid) {
      return c.json({ error: "Invalid Solana signature" }, 401);
    }
    const primaryAgent = await db
      .prepare("SELECT owner_address FROM agents WHERE master_agent_id = ?")
      .bind(activeLink.primary_agent_id)
      .first<{ owner_address: string }>();
    if (
      signerAddress !== activeLink.solana_address &&
      signerAddress !== primaryAgent?.owner_address
    ) {
      return c.json({ error: "Signer is not authorized to unlink" }, 403);
    }
  } else {
    return c.json({ error: "chain must be 'evm' or 'solana'" }, 400);
  }

  // Delete the link and recompute reputation for both agents via batch
  const deleteStmt = db
    .prepare("DELETE FROM wallet_links WHERE linked_agent_id = ?")
    .bind(activeLink.linked_agent_id);

  const primaryUpdateStmts = await buildReputationUpdateStmts(db, activeLink.primary_agent_id);
  const linkedUpdateStmts = await buildReputationUpdateStmts(db, activeLink.linked_agent_id);

  await db.batch([deleteStmt, ...primaryUpdateStmts, ...linkedUpdateStmts]);

  enqueueEvent(db, "link.removed", activeLink.primary_agent_id, {
    linkedAgentId: activeLink.linked_agent_id,
    solanaAddress: activeLink.solana_address,
    evmAddress: activeLink.evm_address,
  });

  return c.json({ message: "Link removed successfully" });
});

// ── Helpers ──────────────────────────────────────────────────────────────

async function findAgent(db: D1Database, id: string): Promise<AgentRow | null> {
  if (id.startsWith("0x") && id.length === 66) {
    return await db.prepare("SELECT master_agent_id, owner_address, created_at FROM agents WHERE master_agent_id = ?").bind(id).first<AgentRow>();
  }
  if (id.startsWith("eip155:") || id.startsWith("solana:")) {
    const identity = await db
      .prepare("SELECT master_agent_id FROM agent_identities WHERE global_agent_id = ?")
      .bind(id)
      .first<{ master_agent_id: string }>();
    if (!identity) return null;
    return await db.prepare("SELECT master_agent_id, owner_address, created_at FROM agents WHERE master_agent_id = ?").bind(identity.master_agent_id).first<AgentRow>();
  }
  if (id.startsWith("0x") && id.length === 42) {
    return await db.prepare("SELECT master_agent_id, owner_address, created_at FROM agents WHERE owner_address = ?").bind(id.toLowerCase()).first<AgentRow>();
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return await db.prepare("SELECT master_agent_id, owner_address, created_at FROM agents WHERE owner_address = ?").bind(id).first<AgentRow>();
  }
  return null;
}

/**
 * Build the D1 prepared statements needed to recompute unified reputation for an agent.
 * Returns an array of statements suitable for db.batch().
 */
async function buildReputationUpdateStmts(db: D1Database, primaryAgentId: string): Promise<D1PreparedStatement[]> {
  // Get all linked agent IDs (primary + all linked)
  const linkedRows = (await db
    .prepare("SELECT linked_agent_id FROM wallet_links WHERE primary_agent_id = ?")
    .bind(primaryAgentId)
    .all<{ linked_agent_id: string }>()).results;
  const allIds = [primaryAgentId, ...linkedRows.map((r) => r.linked_agent_id)];

  const placeholders = allIds.map(() => "?").join(",");
  const rows = (await db
    .prepare(`SELECT summary_value, summary_value_decimals, feedback_count FROM reputation_latest WHERE master_agent_id IN (${placeholders})`)
    .bind(...allIds)
    .all<ReputationLatestRow>()).results;

  if (rows.length === 0) {
    return [
      db.prepare("UPDATE agents SET unified_value = '0', unified_value_decimals = 0, total_feedback_count = '0', updated_at = unixepoch() WHERE master_agent_id = ?")
        .bind(primaryAgentId),
    ];
  }

  // Normalize to max decimals and compute weighted average
  const maxDecimals = Math.max(...rows.map((r) => r.summary_value_decimals));
  let weightedSum = 0n;
  let totalFeedback = 0n;

  for (const row of rows) {
    const value = BigInt(row.summary_value);
    const feedback = BigInt(row.feedback_count);
    const scale = 10n ** BigInt(maxDecimals - row.summary_value_decimals);
    weightedSum += value * scale * feedback;
    totalFeedback += feedback;
  }

  const unifiedValue = totalFeedback > 0n ? weightedSum / totalFeedback : 0n;

  return [
    db.prepare(
      "UPDATE agents SET unified_value = ?, unified_value_decimals = ?, total_feedback_count = ?, updated_at = unixepoch() WHERE master_agent_id = ?"
    ).bind(unifiedValue.toString(), maxDecimals, totalFeedback.toString(), primaryAgentId),
  ];
}
