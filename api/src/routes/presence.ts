import { Hono } from "hono";
import { ethers } from "ethers";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import bs58 from "bs58";
import type { AppEnv } from "../env.js";
import { resolveAgent } from "./agents.js";

// @noble/ed25519 v2 requires sha512 to be configured
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export const presenceRoutes = new Hono<AppEnv>();

// ── Types ────────────────────────────────────────────────────────────────

interface AddressClaimRow {
  id: number;
  master_agent_id: string;
  address: string;
  chain_type: string;
  chain_id: number | null;
  verified_at: number;
  created_at: number;
}

interface ReputationLatestRow {
  master_agent_id: string;
  chain_id: number;
  summary_value: string;
  summary_value_decimals: number;
  feedback_count: string;
}

// ── POST /agents/:id/presence — Add on-chain presence ────────────────────

presenceRoutes.post("/agents/:id/presence", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  let body: {
    address: string;
    chainType: string;
    chainId?: number;
    ownerSignature: string;
    addressSignature: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { address, chainType, chainId, ownerSignature, addressSignature } = body;

  if (!address || !chainType || !ownerSignature || !addressSignature) {
    return c.json({ error: "Missing required fields: address, chainType, ownerSignature, addressSignature" }, 400);
  }

  if (chainType !== "evm" && chainType !== "solana") {
    return c.json({ error: "chainType must be 'evm' or 'solana'" }, 400);
  }

  // Verify owner signature: owner signs "KYA Presence: {address}"
  const ownerMessage = `KYA Presence: ${address}`;
  const ownerAddress = agent.owner_address;

  // Determine owner chain type for sig verification
  const ownerIsEvm = ownerAddress.startsWith("0x") && ownerAddress.length === 42;

  if (ownerIsEvm) {
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(ownerMessage, ownerSignature);
    } catch {
      return c.json({ error: "Invalid owner EVM signature" }, 401);
    }
    if (recovered.toLowerCase() !== ownerAddress.toLowerCase()) {
      return c.json({ error: "Owner signature does not match agent owner_address" }, 401);
    }
  } else {
    // Assume Solana owner
    const msgBytes = new TextEncoder().encode(ownerMessage);
    let sigBytes: Uint8Array;
    let pubkeyBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(ownerSignature);
      pubkeyBytes = bs58.decode(ownerAddress);
    } catch {
      return c.json({ error: "Invalid base58 encoding for owner signature" }, 400);
    }
    let valid: boolean;
    try {
      valid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
    } catch {
      return c.json({ error: "Invalid owner Solana signature" }, 401);
    }
    if (!valid) {
      return c.json({ error: "Owner signature does not match agent owner_address" }, 401);
    }
  }

  // Verify address signature: new address signs "KYA Presence: {masterAgentId}"
  const addressMessage = `KYA Presence: ${agent.master_agent_id}`;

  if (chainType === "evm") {
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(addressMessage, addressSignature);
    } catch {
      return c.json({ error: "Invalid address EVM signature" }, 401);
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return c.json({ error: "Address signature does not match claimed address" }, 401);
    }
  } else {
    // Solana
    const msgBytes = new TextEncoder().encode(addressMessage);
    let sigBytes: Uint8Array;
    let pubkeyBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(addressSignature);
      pubkeyBytes = bs58.decode(address);
    } catch {
      return c.json({ error: "Invalid base58 encoding for address signature" }, 400);
    }
    let valid: boolean;
    try {
      valid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
    } catch {
      return c.json({ error: "Invalid address Solana signature" }, 401);
    }
    if (!valid) {
      return c.json({ error: "Address signature does not match claimed address" }, 401);
    }
  }

  // Insert into address_claims
  try {
    await db.prepare(
      "INSERT INTO address_claims (master_agent_id, address, chain_type, chain_id) VALUES (?, ?, ?, ?)"
    ).bind(
      agent.master_agent_id,
      chainType === "evm" ? address.toLowerCase() : address,
      chainType,
      chainId ?? null
    ).run();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      return c.json({ error: "Address already claimed" }, 409);
    }
    throw err;
  }

  // If address matches another agent's owner_address, merge reputation
  const otherAgent = await db
    .prepare("SELECT master_agent_id, owner_address FROM agents WHERE owner_address = ? AND master_agent_id != ?")
    .bind(chainType === "evm" ? address.toLowerCase() : address, agent.master_agent_id)
    .first<{ master_agent_id: string; owner_address: string }>();

  if (otherAgent) {
    const reputationUpdateStmts = await buildReputationMergeStmts(db, agent.master_agent_id);
    if (reputationUpdateStmts.length > 0) {
      await db.batch(reputationUpdateStmts);
    }
  }

  return c.json({
    masterAgentId: agent.master_agent_id,
    address: chainType === "evm" ? address.toLowerCase() : address,
    chainType,
    chainId: chainId ?? null,
    message: "Presence added successfully",
  }, 201);
});

// ── GET /agents/:id/presence — List on-chain presence ────────────────────

presenceRoutes.get("/agents/:id/presence", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const { results: claims } = await db
    .prepare("SELECT * FROM address_claims WHERE master_agent_id = ? ORDER BY created_at DESC")
    .bind(agent.master_agent_id)
    .all<AddressClaimRow>();

  return c.json({
    masterAgentId: agent.master_agent_id,
    presence: claims.map((cl) => ({
      address: cl.address,
      chainType: cl.chain_type,
      chainId: cl.chain_id,
      verifiedAt: cl.verified_at,
    })),
  });
});

// ── DELETE /agents/:id/presence — Remove on-chain presence ───────────────

presenceRoutes.delete("/agents/:id/presence", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  let body: { address: string; chainType: string; signature: string; signerAddress: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { address, chainType, signature, signerAddress } = body;

  if (!address || !chainType || !signature || !signerAddress) {
    return c.json({ error: "Missing required fields: address, chainType, signature, signerAddress" }, 400);
  }

  // Verify the claim exists
  const claim = await db
    .prepare("SELECT * FROM address_claims WHERE master_agent_id = ? AND address = ? AND chain_type = ?")
    .bind(agent.master_agent_id, chainType === "evm" ? address.toLowerCase() : address, chainType)
    .first<AddressClaimRow>();

  if (!claim) {
    return c.json({ error: "Presence claim not found" }, 404);
  }

  // Verify signature: signs "KYA Remove Presence: {masterAgentId}"
  const removeMessage = `KYA Remove Presence: ${agent.master_agent_id}`;

  // Signer must be owner or the claimed address
  const ownerAddress = agent.owner_address;
  const normalizedSigner = chainType === "evm" ? signerAddress.toLowerCase() : signerAddress;
  const normalizedOwner = ownerAddress.toLowerCase();
  const normalizedClaimed = claim.address;

  if (normalizedSigner !== normalizedOwner && normalizedSigner !== normalizedClaimed) {
    return c.json({ error: "Signer must be the agent owner or the claimed address" }, 403);
  }

  // Verify the signature
  const signerIsEvm = signerAddress.startsWith("0x") && signerAddress.length === 42;

  if (signerIsEvm) {
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(removeMessage, signature);
    } catch {
      return c.json({ error: "Invalid EVM signature" }, 401);
    }
    if (recovered.toLowerCase() !== signerAddress.toLowerCase()) {
      return c.json({ error: "Signature does not match signerAddress" }, 401);
    }
  } else {
    const msgBytes = new TextEncoder().encode(removeMessage);
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
      return c.json({ error: "Invalid Solana signature" }, 401);
    }
    if (!valid) {
      return c.json({ error: "Invalid Solana signature" }, 401);
    }
  }

  await db
    .prepare("DELETE FROM address_claims WHERE id = ?")
    .bind(claim.id)
    .run();

  return c.json({ message: "Presence removed successfully" });
});

// ── Helpers ──────────────────────────────────────────────────────────────

async function buildReputationMergeStmts(db: D1Database, primaryAgentId: string): Promise<D1PreparedStatement[]> {
  const { results: linkedRows } = await db
    .prepare("SELECT linked_agent_id FROM wallet_links WHERE primary_agent_id = ?")
    .bind(primaryAgentId)
    .all<{ linked_agent_id: string }>();
  const allIds = [primaryAgentId, ...linkedRows.map((r) => r.linked_agent_id)];

  const placeholders = allIds.map(() => "?").join(",");
  const { results: rows } = await db
    .prepare(`SELECT summary_value, summary_value_decimals, feedback_count FROM reputation_latest WHERE master_agent_id IN (${placeholders})`)
    .bind(...allIds)
    .all<ReputationLatestRow>();

  if (rows.length === 0) {
    return [
      db.prepare("UPDATE agents SET unified_value = '0', unified_value_decimals = 0, total_feedback_count = '0', updated_at = unixepoch() WHERE master_agent_id = ?")
        .bind(primaryAgentId),
    ];
  }

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
