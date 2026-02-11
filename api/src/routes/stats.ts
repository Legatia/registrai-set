import { Hono } from "hono";
import { getNetworkChains } from "../chains.js";
import type { AppEnv } from "../env.js";

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get("/stats", async (c) => {
  const db = c.env.DB;
  const network = c.req.query("network");
  const chains = getNetworkChains(network);

  if (chains) {
    const placeholders = chains.map(() => "?").join(",");

    const [agents, identities, chainsCount, feedbackRow] = await db.batch([
      db.prepare(
        `SELECT COUNT(DISTINCT a.master_agent_id) as cnt FROM agents a JOIN agent_identities ai ON a.master_agent_id = ai.master_agent_id WHERE ai.chain_id IN (${placeholders})`
      ).bind(...chains),
      db.prepare(
        `SELECT COUNT(*) as cnt FROM agent_identities WHERE chain_id IN (${placeholders})`
      ).bind(...chains),
      db.prepare(
        `SELECT COUNT(DISTINCT chain_id) as cnt FROM agent_identities WHERE chain_id IN (${placeholders})`
      ).bind(...chains),
      db.prepare(
        `SELECT COALESCE(SUM(CAST(feedback_count AS INTEGER)), 0) as total FROM reputation_latest WHERE chain_id IN (${placeholders})`
      ).bind(...chains),
    ]);

    return c.json({
      totalAgents: (agents.results[0] as any)?.cnt ?? 0,
      totalIdentities: (identities.results[0] as any)?.cnt ?? 0,
      totalFeedback: (feedbackRow.results[0] as any)?.total ?? 0,
      chainsTracked: (chainsCount.results[0] as any)?.cnt ?? 0,
    });
  }

  const [agents, identities, chainsCount, feedbackRow] = await db.batch([
    db.prepare("SELECT COUNT(*) as cnt FROM agents"),
    db.prepare("SELECT COUNT(*) as cnt FROM agent_identities"),
    db.prepare("SELECT COUNT(DISTINCT chain_id) as cnt FROM agent_identities"),
    db.prepare("SELECT COALESCE(SUM(CAST(feedback_count AS INTEGER)), 0) as total FROM reputation_latest"),
  ]);

  return c.json({
    totalAgents: (agents.results[0] as any)?.cnt ?? 0,
    totalIdentities: (identities.results[0] as any)?.cnt ?? 0,
    totalFeedback: (feedbackRow.results[0] as any)?.total ?? 0,
    chainsTracked: (chainsCount.results[0] as any)?.cnt ?? 0,
  });
});
