import { Hono } from "hono";
import { generateId, generateApiKey } from "../db.js";
import type { AppEnv } from "../env.js";

export const developerRoutes = new Hono<AppEnv>();

interface DeveloperRow {
  id: string;
  name: string;
  email: string;
  created_at: number;
}

interface ApiKeyRow {
  key: string;
  developer_id: string;
  label: string;
  scopes: string;
  revoked_at: number | null;
  created_at: number;
}

// ── POST /developers — Register developer ────────────────────

developerRoutes.post("/developers", async (c) => {
  let body: { name: string; email: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { name, email } = body;
  if (!name || !email) {
    return c.json({ error: "Missing required fields: name, email" }, 400);
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  const db = c.env.DB;
  const devId = generateId();
  const apiKey = generateApiKey();
  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();

  try {
    await db.batch([
      db.prepare("INSERT INTO developers (id, name, email) VALUES (?, ?, ?)").bind(devId, trimmedName, trimmedEmail),
      db.prepare("INSERT INTO api_keys (key, developer_id, label) VALUES (?, ?, ?)").bind(apiKey, devId, "default"),
    ]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "A developer with this email already exists" }, 409);
    }
    throw err;
  }

  return c.json({ id: devId, name: trimmedName, email: trimmedEmail, apiKey }, 201);
});

// ── GET /developers/:id — Get developer profile ─────────────

developerRoutes.get("/developers/:id", async (c) => {
  const id = c.req.param("id");
  const dev = await c.env.DB.prepare("SELECT * FROM developers WHERE id = ?").bind(id).first<DeveloperRow>();

  if (!dev) {
    return c.json({ error: "Developer not found" }, 404);
  }

  return c.json({ id: dev.id, name: dev.name, email: dev.email, createdAt: dev.created_at });
});

// ── POST /developers/:id/keys — Create additional API key ───

developerRoutes.post("/developers/:id/keys", async (c) => {
  const id = c.req.param("id");
  let body: { label?: string; scopes?: string } = {};
  try {
    body = await c.req.json();
  } catch { /* body is optional */ }

  const db = c.env.DB;
  const dev = await db.prepare("SELECT id FROM developers WHERE id = ?").bind(id).first<{ id: string }>();
  if (!dev) {
    return c.json({ error: "Developer not found" }, 404);
  }

  const apiKey = generateApiKey();
  const label = (body.label || "").trim().slice(0, 100);
  const scopes = body.scopes || "read,write";

  await db.prepare(
    "INSERT INTO api_keys (key, developer_id, label, scopes) VALUES (?, ?, ?, ?)"
  ).bind(apiKey, id, label, scopes).run();

  return c.json({ key: apiKey, developerId: id, label, scopes }, 201);
});

// ── GET /developers/:id/keys — List developer's API keys ────

developerRoutes.get("/developers/:id/keys", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const dev = await db.prepare("SELECT id FROM developers WHERE id = ?").bind(id).first<{ id: string }>();
  if (!dev) {
    return c.json({ error: "Developer not found" }, 404);
  }

  const { results: keys } = await db
    .prepare("SELECT key, label, scopes, revoked_at, created_at FROM api_keys WHERE developer_id = ? ORDER BY created_at DESC")
    .bind(id)
    .all<ApiKeyRow>();

  return c.json({
    keys: keys.map((k) => ({
      key: k.key.slice(0, 8) + "..." + k.key.slice(-4),
      label: k.label,
      scopes: k.scopes,
      active: k.revoked_at === null,
      createdAt: k.created_at,
      revokedAt: k.revoked_at,
    })),
  });
});

// ── DELETE /developers/:id/keys/:key — Revoke a key ─────────

developerRoutes.delete("/developers/:id/keys/:key", async (c) => {
  const id = c.req.param("id");
  const key = c.req.param("key");

  const result = await c.env.DB
    .prepare("UPDATE api_keys SET revoked_at = unixepoch() WHERE key = ? AND developer_id = ? AND revoked_at IS NULL")
    .bind(key, id)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Key not found, does not belong to this developer, or already revoked" }, 404);
  }

  return c.json({ message: "API key revoked" });
});

// ── GET /developers/:id/usage — Usage stats (last 30 days) ──

developerRoutes.get("/developers/:id/usage", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const dev = await db.prepare("SELECT id FROM developers WHERE id = ?").bind(id).first<{ id: string }>();
  if (!dev) {
    return c.json({ error: "Developer not found" }, 404);
  }

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  const [dailyResult, endpointResult, totalResult] = await db.batch([
    db.prepare(
      `SELECT date(recorded_at, 'unixepoch') as day, COUNT(*) as calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at > ?
       GROUP BY day ORDER BY day DESC`
    ).bind(id, thirtyDaysAgo),
    db.prepare(
      `SELECT method, path, COUNT(*) as calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at > ?
       GROUP BY method, path ORDER BY calls DESC LIMIT 50`
    ).bind(id, thirtyDaysAgo),
    db.prepare(
      `SELECT COUNT(*) as calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at > ?`
    ).bind(id, thirtyDaysAgo),
  ]);

  const total = (totalResult.results[0] as any)?.calls ?? 0;

  return c.json({
    developerId: id,
    period: "last_30_days",
    totalCalls: total,
    daily: dailyResult.results,
    byEndpoint: endpointResult.results,
  });
});
