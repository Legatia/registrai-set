import { Hono } from "hono";
import type { AppEnv } from "../env.js";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/health", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM agents").first<{ cnt: number }>();
    return c.json({ status: "ok", agentCount: row?.cnt ?? 0 });
  } catch (err) {
    return c.json({ status: "error", message: String(err) }, 500);
  }
});
