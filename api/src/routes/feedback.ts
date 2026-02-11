import { Hono } from "hono";
import { ethers } from "ethers";
import { getChainName, getReputationRegistry, isEvmChain } from "../chains.js";
import { resolveAgent, getAllLinkedIds } from "./agents.js";
import { enqueueEvent } from "../webhooks/dispatcher.js";
import type { AppEnv } from "../env.js";

export const feedbackRoutes = new Hono<AppEnv>();

const GIVE_FEEDBACK_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
];

const iface = new ethers.Interface(GIVE_FEEDBACK_ABI);

const RATE_LIMIT_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_COMMENT_LENGTH = 500;
const SCORE_MIN = -1000;
const SCORE_MAX = 1000;

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

interface IdentityRow {
  master_agent_id: string;
  global_agent_id: string;
  chain_id: number;
  l2_agent_id: string;
}

interface FeedbackCommentRow {
  id: number;
  master_agent_id: string;
  chain_id: number;
  commenter_address: string;
  score: number;
  tag: string;
  comment_text: string;
  comment_hash: string;
  tx_hash: string | null;
  created_at: number;
}

// ── POST /agents/:id/feedback — Store comment + rate limit check ─────────

feedbackRoutes.post("/agents/:id/feedback", async (c) => {
  const id = c.req.param("id");

  let body: {
    chainId: number;
    commenterAddress: string;
    score: number;
    tag?: string;
    comment?: string;
    commentHash: string;
    txHash?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { chainId, commenterAddress, score, commentHash } = body;

  if (chainId === undefined || !commenterAddress || score === undefined || !commentHash) {
    return c.json(
      { error: "Missing required fields: chainId, commenterAddress, score, commentHash" },
      400
    );
  }

  if (!ETH_ADDRESS_RE.test(commenterAddress)) {
    return c.json({ error: "commenterAddress must be a valid Ethereum address (0x + 40 hex)" }, 400);
  }

  if (!BYTES32_RE.test(commentHash)) {
    return c.json({ error: "commentHash must be a valid bytes32 (0x + 64 hex)" }, 400);
  }

  if (typeof score !== "number" || !Number.isInteger(score)) {
    return c.json({ error: "score must be an integer" }, 400);
  }

  if (score < SCORE_MIN || score > SCORE_MAX) {
    return c.json({ error: `score must be between ${SCORE_MIN} and ${SCORE_MAX}` }, 400);
  }

  if (typeof chainId !== "number") {
    return c.json({ error: "chainId must be a number" }, 400);
  }

  if (!isEvmChain(chainId)) {
    return c.json({ error: `Chain ${chainId} is not a supported EVM chain` }, 400);
  }

  const commentText = (body.comment || "").slice(0, MAX_COMMENT_LENGTH);

  if (body.txHash !== undefined && !TX_HASH_RE.test(body.txHash)) {
    return c.json({ error: "txHash must be a valid transaction hash (0x + 64 hex)" }, 400);
  }

  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const cutoff = Math.floor(Date.now() / 1000) - RATE_LIMIT_SECONDS;
  const recent = await db
    .prepare(
      "SELECT id FROM feedback_comments WHERE master_agent_id = ? AND commenter_address = ? AND created_at > ? LIMIT 1"
    )
    .bind(agent.master_agent_id, commenterAddress.toLowerCase(), cutoff)
    .first<{ id: number }>();

  if (recent) {
    return c.json(
      { error: "Rate limited — you can submit feedback for this agent once every 24 hours" },
      429
    );
  }

  const result = await db
    .prepare(
      `INSERT INTO feedback_comments (master_agent_id, chain_id, commenter_address, score, tag, comment_text, comment_hash, tx_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      agent.master_agent_id,
      chainId,
      commenterAddress.toLowerCase(),
      score,
      (body.tag || "").slice(0, 50),
      commentText,
      commentHash,
      body.txHash || null
    )
    .run();

  enqueueEvent(db, "feedback.received", agent.master_agent_id, {
    commentId: result.meta.last_row_id,
    score,
    commenter: commenterAddress.toLowerCase(),
  });

  return c.json(
    {
      id: result.meta.last_row_id,
      commentHash,
      message: "Comment stored",
    },
    201
  );
});

// ── GET /agents/:id/feedback — List comments for an agent ────────────────

feedbackRoutes.get("/agents/:id/feedback", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM feedback_comments WHERE master_agent_id IN (${placeholders})`
    )
    .bind(...allIds)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const { results: rows } = await db
    .prepare(
      `SELECT * FROM feedback_comments WHERE master_agent_id IN (${placeholders}) ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...allIds, limit, offset)
    .all<FeedbackCommentRow>();

  return c.json({
    masterAgentId: agent.master_agent_id,
    comments: rows.map((r) => ({
      id: r.id,
      chainId: r.chain_id,
      chainName: getChainName(r.chain_id),
      commenterAddress: r.commenter_address,
      score: r.score,
      tag: r.tag,
      comment: r.comment_text,
      commentHash: r.comment_hash,
      txHash: r.tx_hash,
      createdAt: r.created_at,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ── PATCH /agents/:id/feedback/:commentId/tx — Update tx hash ────────────

feedbackRoutes.patch("/agents/:id/feedback/:commentId/tx", async (c) => {
  const id = c.req.param("id");
  const commentId = c.req.param("commentId");

  let body: { txHash: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.txHash || !TX_HASH_RE.test(body.txHash)) {
    return c.json({ error: "txHash must be a valid transaction hash (0x + 64 hex)" }, 400);
  }

  // Verify the agent exists and the comment belongs to it
  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const result = await db
    .prepare(
      `UPDATE feedback_comments SET tx_hash = ? WHERE id = ? AND tx_hash IS NULL AND master_agent_id IN (${placeholders})`
    )
    .bind(body.txHash, Number(commentId), ...allIds)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Comment not found, does not belong to this agent, or tx_hash already set" }, 404);
  }

  return c.json({ message: "Transaction hash updated" });
});

// ── POST /agents/:id/feedback/build — Build unsigned giveFeedback tx ─────

feedbackRoutes.post("/agents/:id/feedback/build", async (c) => {
  const id = c.req.param("id");

  let body: {
    chainId: number;
    value: string;
    valueDecimals: number;
    tag1?: string;
    tag2?: string;
    endpoint?: string;
    feedbackURI?: string;
    feedbackHash?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { chainId, value, valueDecimals } = body;

  if (chainId === undefined || value === undefined || valueDecimals === undefined) {
    return c.json({ error: "Missing required fields: chainId, value, valueDecimals" }, 400);
  }

  if (typeof chainId !== "number" || typeof valueDecimals !== "number") {
    return c.json({ error: "chainId and valueDecimals must be numbers" }, 400);
  }

  if (!isEvmChain(chainId)) {
    return c.json({ error: `Chain ${chainId} is not a supported EVM chain` }, 400);
  }

  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  // Find identity on the requested chain
  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const identity = await db
    .prepare(
      `SELECT * FROM agent_identities WHERE master_agent_id IN (${placeholders}) AND chain_id = ? LIMIT 1`
    )
    .bind(...allIds, chainId)
    .first<IdentityRow>();

  if (!identity) {
    return c.json({ error: `Agent has no identity on chain ${chainId}` }, 404);
  }

  const registryAddress = getReputationRegistry(chainId)!;
  const tag1 = body.tag1 ?? "";
  const tag2 = body.tag2 ?? "";
  const endpoint = body.endpoint ?? "";
  const feedbackURI = body.feedbackURI ?? "";
  const feedbackHash =
    body.feedbackHash ??
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  const data = iface.encodeFunctionData("giveFeedback", [
    BigInt(identity.l2_agent_id),
    BigInt(value),
    valueDecimals,
    tag1,
    tag2,
    endpoint,
    feedbackURI,
    feedbackHash,
  ]);

  return c.json({
    chainId,
    chainName: getChainName(chainId),
    to: registryAddress,
    data,
    agentId: identity.l2_agent_id,
    globalAgentId: identity.global_agent_id,
  });
});

// ── GET /agents/:id/feedback/chains — List EVM chains for feedback ──────

feedbackRoutes.get("/agents/:id/feedback/chains", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const agent = await resolveAgent(db, id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const allIds = await getAllLinkedIds(db, agent.master_agent_id);
  const placeholders = allIds.map(() => "?").join(",");

  const { results: identities } = await db
    .prepare(
      `SELECT * FROM agent_identities WHERE master_agent_id IN (${placeholders}) ORDER BY chain_id`
    )
    .bind(...allIds)
    .all<IdentityRow>();

  const chains = identities
    .filter((i) => isEvmChain(i.chain_id))
    .map((i) => ({
      chainId: i.chain_id,
      chainName: getChainName(i.chain_id),
      reputationRegistry: getReputationRegistry(i.chain_id)!,
      agentId: i.l2_agent_id,
      globalAgentId: i.global_agent_id,
    }));

  return c.json({
    masterAgentId: agent.master_agent_id,
    chains,
  });
});
