import { Hono } from "hono";
import { generateId, generateSecret } from "../db.js";
import type { AppEnv } from "../env.js";
import { writeAuditLog } from "../audit.js";

export const webhookRoutes = new Hono<AppEnv>();

const VALID_EVENTS = [
  "feedback.received",
  "reputation.changed",
  "reputation.threshold",
  "agent.registered",
  "link.created",
  "link.removed",
] as const;

interface WebhookRow {
  id: string;
  developer_id: string;
  url: string;
  secret: string;
  events: string;
  agent_id: string | null;
  active: number;
  created_at: number;
}

interface DeliveryRow {
  id: number;
  webhook_id: string;
  event: string;
  payload: string;
  status_code: number | null;
  attempts: number;
  next_retry_at: number | null;
  delivered_at: number | null;
  created_at: number;
}

function getDeveloperId(c: any): string | undefined {
  return c.get("developerId") as string | undefined;
}

// ── POST /webhooks — Register webhook ────────────────────────

webhookRoutes.post("/webhooks", async (c) => {
  const developerId = getDeveloperId(c);
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Webhook management requires a developer API key" }, 403);
  }

  let body: { url: string; events: string[]; agentId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { url, events, agentId } = body;

  if (!url || !events || !Array.isArray(events) || events.length === 0) {
    return c.json({ error: "Missing required fields: url, events (non-empty array)" }, 400);
  }

  try {
    new URL(url);
  } catch {
    return c.json({ error: "url must be a valid URL" }, 400);
  }

  const invalidEvents = events.filter(
    (e) => !(VALID_EVENTS as readonly string[]).includes(e)
  );
  if (invalidEvents.length > 0) {
    return c.json(
      { error: `Invalid event types: ${invalidEvents.join(", ")}. Valid: ${VALID_EVENTS.join(", ")}` },
      400
    );
  }

  const id = generateId();
  const secret = generateSecret();

  await c.env.DB.prepare(
    "INSERT INTO webhooks (id, developer_id, url, secret, events, agent_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, developerId, url, secret, events.join(","), agentId || null).run();

  await writeAuditLog(c.env.DB, {
    actorType: "developer",
    actorId: developerId,
    action: "webhook.created",
    targetType: "webhook",
    targetId: id,
    metadata: { url, events, agentId: agentId || null },
  });

  return c.json(
    {
      id,
      url,
      secret,
      events,
      agentId: agentId || null,
      active: true,
      createdAt: Math.floor(Date.now() / 1000),
    },
    201
  );
});

// ── GET /webhooks — List my webhooks ─────────────────────────

webhookRoutes.get("/webhooks", async (c) => {
  const developerId = getDeveloperId(c);
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Webhook management requires a developer API key" }, 403);
  }

  const { results: rows } = await c.env.DB
    .prepare("SELECT * FROM webhooks WHERE developer_id = ? ORDER BY created_at DESC")
    .bind(developerId)
    .all<WebhookRow>();

  return c.json({
    webhooks: rows.map((r) => ({
      id: r.id,
      url: r.url,
      events: r.events.split(","),
      agentId: r.agent_id,
      active: r.active === 1,
      createdAt: r.created_at,
    })),
  });
});

// ── GET /webhooks/:id — Get webhook details ──────────────────

webhookRoutes.get("/webhooks/:id", async (c) => {
  const developerId = getDeveloperId(c);
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Webhook management requires a developer API key" }, 403);
  }

  const id = c.req.param("id");
  const row = await c.env.DB
    .prepare("SELECT * FROM webhooks WHERE id = ? AND developer_id = ?")
    .bind(id, developerId)
    .first<WebhookRow>();

  if (!row) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json({
    id: row.id,
    url: row.url,
    events: row.events.split(","),
    agentId: row.agent_id,
    active: row.active === 1,
    createdAt: row.created_at,
  });
});

// ── PATCH /webhooks/:id — Update webhook ─────────────────────

webhookRoutes.patch("/webhooks/:id", async (c) => {
  const developerId = getDeveloperId(c);
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Webhook management requires a developer API key" }, 403);
  }

  const id = c.req.param("id");
  let body: { url?: string; events?: string[]; active?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const db = c.env.DB;
  const existing = await db
    .prepare("SELECT * FROM webhooks WHERE id = ? AND developer_id = ?")
    .bind(id, developerId)
    .first<WebhookRow>();

  if (!existing) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  if (body.url !== undefined) {
    try {
      new URL(body.url);
    } catch {
      return c.json({ error: "url must be a valid URL" }, 400);
    }
  }

  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return c.json({ error: "events must be a non-empty array" }, 400);
    }
    const invalidEvents = body.events.filter(
      (e) => !(VALID_EVENTS as readonly string[]).includes(e)
    );
    if (invalidEvents.length > 0) {
      return c.json({ error: `Invalid event types: ${invalidEvents.join(", ")}` }, 400);
    }
  }

  const url = body.url ?? existing.url;
  const events = body.events ? body.events.join(",") : existing.events;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;

  await db.prepare(
    "UPDATE webhooks SET url = ?, events = ?, active = ? WHERE id = ?"
  ).bind(url, events, active, id).run();

  await writeAuditLog(db, {
    actorType: "developer",
    actorId: developerId,
    action: "webhook.updated",
    targetType: "webhook",
    targetId: id,
    metadata: { url, events: events.split(","), active: active === 1 },
  });

  return c.json({
    id,
    url,
    events: events.split(","),
    agentId: existing.agent_id,
    active: active === 1,
    createdAt: existing.created_at,
  });
});

// ── DELETE /webhooks/:id — Delete webhook ────────────────────

webhookRoutes.delete("/webhooks/:id", async (c) => {
  const developerId = getDeveloperId(c);
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Webhook management requires a developer API key" }, 403);
  }

  const id = c.req.param("id");
  const db = c.env.DB;

  const result = await db
    .prepare("DELETE FROM webhooks WHERE id = ? AND developer_id = ?")
    .bind(id, developerId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  // Clean up deliveries
  await db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ?").bind(id).run();

  await writeAuditLog(db, {
    actorType: "developer",
    actorId: developerId,
    action: "webhook.deleted",
    targetType: "webhook",
    targetId: id,
  });

  return c.json({ message: "Webhook deleted" });
});

// ── GET /webhooks/:id/deliveries — List delivery attempts ────

webhookRoutes.get("/webhooks/:id/deliveries", async (c) => {
  const developerId = getDeveloperId(c);
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Webhook management requires a developer API key" }, 403);
  }

  const id = c.req.param("id");
  const db = c.env.DB;

  const webhook = await db
    .prepare("SELECT id FROM webhooks WHERE id = ? AND developer_id = ?")
    .bind(id, developerId)
    .first<{ id: string }>();

  if (!webhook) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const countRow = await db
    .prepare("SELECT COUNT(*) as cnt FROM webhook_deliveries WHERE webhook_id = ?")
    .bind(id)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const { results: rows } = await db
    .prepare("SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(id, limit, offset)
    .all<DeliveryRow>();

  return c.json({
    deliveries: rows.map((r) => ({
      id: r.id,
      event: r.event,
      payload: JSON.parse(r.payload),
      statusCode: r.status_code,
      attempts: r.attempts,
      nextRetryAt: r.next_retry_at,
      deliveredAt: r.delivered_at,
      createdAt: r.created_at,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
