import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { generateId } from "../db.js";
import { writeAuditLog } from "../audit.js";

export const adminRoutes = new Hono<AppEnv>();

interface CountRow {
  cnt?: number;
}

interface AuditRow {
  id: number;
  actor_type: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: string;
  created_at: number;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  total_per_day: number;
  write_per_day: number;
  feedback_submit_per_day: number;
  is_active: number;
  created_at: number;
}

adminRoutes.get("/admin/overview", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;

  const [devRes, keysRes, activeKeysRes, webhookRes, activeWebhookRes, pendingRes, failedRes, limitedRes, cursorRes] =
    await c.env.DB.batch([
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM developers"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM api_keys"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM api_keys WHERE revoked_at IS NULL"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM webhooks"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM webhooks WHERE active = 1"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM webhook_deliveries WHERE status_code IS NULL"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM webhook_deliveries WHERE status_code = -1 OR status_code >= 400"),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM api_usage WHERE status_code = 429 AND recorded_at > ?").bind(oneDayAgo),
      c.env.DB.prepare("SELECT chain_id, last_block, updated_at FROM sync_cursors ORDER BY chain_id ASC"),
    ]);

  const topOffenders = await c.env.DB
    .prepare(
      `SELECT api_key, COUNT(*) as hits
       FROM api_usage
       WHERE status_code = 429 AND recorded_at > ?
       GROUP BY api_key
       ORDER BY hits DESC
       LIMIT 10`
    )
    .bind(oneDayAgo)
    .all<{ api_key: string; hits: number }>();

  return c.json({
    totals: {
      developers: (devRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      apiKeys: (keysRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      activeApiKeys: (activeKeysRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      webhooks: (webhookRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      activeWebhooks: (activeWebhookRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      pendingDeliveries: (pendingRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      failedDeliveries: (failedRes.results[0] as CountRow | undefined)?.cnt ?? 0,
      rateLimited24h: (limitedRes.results[0] as CountRow | undefined)?.cnt ?? 0,
    },
    topRateLimitedKeys24h: topOffenders.results.map((r) => ({
      apiKeyMasked: `${r.api_key.slice(0, 8)}...${r.api_key.slice(-4)}`,
      hits: r.hits,
    })),
    syncCursors: cursorRes.results,
  });
});

adminRoutes.get("/admin/audit", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "25", 10)));
  const offset = (page - 1) * limit;

  const [countResult, logsResult] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM audit_logs"),
    c.env.DB
      .prepare(
        `SELECT id, actor_type, actor_id, action, target_type, target_id, metadata, created_at
         FROM audit_logs
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(limit, offset),
  ]);

  const total = (countResult.results[0] as CountRow | undefined)?.cnt ?? 0;
  return c.json({
    logs: logsResult.results.map((r) => {
      const row = r as AuditRow;
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = {};
      }
      return {
        id: row.id,
        actorType: row.actor_type,
        actorId: row.actor_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata,
        createdAt: row.created_at,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

adminRoutes.get("/admin/plans", async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, name, slug, price_cents, billing_interval, total_per_day, write_per_day, feedback_submit_per_day, is_active, created_at
       FROM plans
       ORDER BY created_at DESC`
    )
    .all<PlanRow>();

  return c.json({
    plans: results.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      priceCents: p.price_cents,
      billingInterval: p.billing_interval,
      quota: {
        totalPerDay: p.total_per_day,
        writePerDay: p.write_per_day,
        feedbackSubmitPerDay: p.feedback_submit_per_day,
      },
      active: p.is_active === 1,
      createdAt: p.created_at,
    })),
  });
});

adminRoutes.post("/admin/plans", async (c) => {
  let body: {
    name: string;
    slug: string;
    priceCents?: number;
    billingInterval?: string;
    totalPerDay: number;
    writePerDay: number;
    feedbackSubmitPerDay: number;
    active?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.name?.trim() || !body.slug?.trim()) {
    return c.json({ error: "Missing required fields: name, slug" }, 400);
  }

  const planId = generateId();
  const slug = body.slug.trim().toLowerCase();
  const adminActor = c.get("adminActor") || "admin";

  try {
    await c.env.DB
      .prepare(
        `INSERT INTO plans (id, name, slug, price_cents, billing_interval, total_per_day, write_per_day, feedback_submit_per_day, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        planId,
        body.name.trim(),
        slug,
        body.priceCents ?? 0,
        body.billingInterval || "monthly",
        body.totalPerDay,
        body.writePerDay,
        body.feedbackSubmitPerDay,
        body.active === false ? 0 : 1
      )
      .run();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "Plan slug already exists" }, 409);
    }
    throw err;
  }

  await writeAuditLog(c.env.DB, {
    actorType: "admin",
    actorId: adminActor,
    action: "plan.created",
    targetType: "plan",
    targetId: planId,
    metadata: { slug },
  });

  return c.json({ id: planId, slug }, 201);
});

adminRoutes.get("/admin/developers/:id/plan", async (c) => {
  const developerId = c.req.param("id");
  const now = Math.floor(Date.now() / 1000);

  const row = await c.env.DB
    .prepare(
      `SELECT p.id, p.name, p.slug, p.price_cents, p.billing_interval, p.total_per_day, p.write_per_day, p.feedback_submit_per_day,
              a.starts_at, a.ends_at
       FROM developer_plan_assignments a
       JOIN plans p ON p.id = a.plan_id
       WHERE a.developer_id = ?
         AND a.starts_at <= ?
         AND (a.ends_at IS NULL OR a.ends_at > ?)
       ORDER BY a.starts_at DESC
       LIMIT 1`
    )
    .bind(developerId, now, now)
    .first<PlanRow & { starts_at: number; ends_at: number | null }>();

  if (!row) {
    return c.json({ developerId, plan: null });
  }

  return c.json({
    developerId,
    plan: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      priceCents: row.price_cents,
      billingInterval: row.billing_interval,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      quota: {
        totalPerDay: row.total_per_day,
        writePerDay: row.write_per_day,
        feedbackSubmitPerDay: row.feedback_submit_per_day,
      },
    },
  });
});

adminRoutes.post("/admin/developers/:id/plan", async (c) => {
  const developerId = c.req.param("id");
  let body: { planId: string; startsAt?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.planId) {
    return c.json({ error: "Missing required field: planId" }, 400);
  }

  const startsAt = body.startsAt ?? Math.floor(Date.now() / 1000);
  const [devRes, planRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id FROM developers WHERE id = ?").bind(developerId),
    c.env.DB.prepare("SELECT id FROM plans WHERE id = ? AND is_active = 1").bind(body.planId),
  ]);
  if (devRes.results.length === 0) return c.json({ error: "Developer not found" }, 404);
  if (planRes.results.length === 0) return c.json({ error: "Active plan not found" }, 404);

  await c.env.DB.batch([
    c.env.DB
      .prepare("UPDATE developer_plan_assignments SET ends_at = ? WHERE developer_id = ? AND ends_at IS NULL")
      .bind(startsAt, developerId),
    c.env.DB
      .prepare("INSERT INTO developer_plan_assignments (developer_id, plan_id, starts_at) VALUES (?, ?, ?)")
      .bind(developerId, body.planId, startsAt),
  ]);

  const adminActor = c.get("adminActor") || "admin";
  await writeAuditLog(c.env.DB, {
    actorType: "admin",
    actorId: adminActor,
    action: "developer.plan_assigned",
    targetType: "developer",
    targetId: developerId,
    metadata: { planId: body.planId, startsAt },
  });

  return c.json({ developerId, planId: body.planId, startsAt });
});
