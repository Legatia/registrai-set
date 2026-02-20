import { Hono } from "hono";
import { generateId } from "../db.js";
import { writeAuditLog } from "../audit.js";
import type { AppEnv } from "../env.js";

export const billingRoutes = new Hono<AppEnv>();

interface SubscriptionRow {
  id: string;
  provider: string;
  external_subscription_id: string;
  owner_type: string;
  owner_id: string;
  plan_id: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

interface UsageExportRow {
  developer_id: string;
  developer_email: string;
  total_calls: number;
  write_calls: number;
  rate_limited_calls: number;
}

billingRoutes.get("/admin/billing/overview", async (c) => {
  const activeStatuses = ["active", "trialing"];
  const placeholders = activeStatuses.map(() => "?").join(", ");

  const [countsRes, mrrRes, arrRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT
         COUNT(*) as total_subscriptions,
         SUM(CASE WHEN status IN (${placeholders}) THEN 1 ELSE 0 END) as active_subscriptions,
         SUM(CASE WHEN status IN (${placeholders}) AND owner_type = 'developer' THEN 1 ELSE 0 END) as active_developer_subscriptions,
         SUM(CASE WHEN status IN (${placeholders}) AND owner_type = 'organization' THEN 1 ELSE 0 END) as active_organization_subscriptions
       FROM subscriptions`
    ).bind(...activeStatuses, ...activeStatuses, ...activeStatuses),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(
          CASE
            WHEN status IN (${placeholders}) AND billing_interval = 'monthly' THEN amount_cents
            WHEN status IN (${placeholders}) AND billing_interval = 'yearly' THEN CAST(amount_cents / 12 AS INTEGER)
            ELSE 0
          END
        ), 0) as mrr_cents
       FROM subscriptions`
    ).bind(...activeStatuses, ...activeStatuses),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(
          CASE
            WHEN status IN (${placeholders}) AND billing_interval = 'yearly' THEN amount_cents
            WHEN status IN (${placeholders}) AND billing_interval = 'monthly' THEN amount_cents * 12
            ELSE 0
          END
        ), 0) as arr_cents
       FROM subscriptions`
    ).bind(...activeStatuses, ...activeStatuses),
  ]);

  const counts = countsRes.results[0] as {
    total_subscriptions?: number;
    active_subscriptions?: number;
    active_developer_subscriptions?: number;
    active_organization_subscriptions?: number;
  } | undefined;
  const mrr = (mrrRes.results[0] as { mrr_cents?: number } | undefined)?.mrr_cents ?? 0;
  const arr = (arrRes.results[0] as { arr_cents?: number } | undefined)?.arr_cents ?? 0;

  return c.json({
    totals: {
      totalSubscriptions: counts?.total_subscriptions ?? 0,
      activeSubscriptions: counts?.active_subscriptions ?? 0,
      activeDeveloperSubscriptions: counts?.active_developer_subscriptions ?? 0,
      activeOrganizationSubscriptions: counts?.active_organization_subscriptions ?? 0,
    },
    revenue: {
      mrrCents: mrr,
      arrCents: arr,
    },
  });
});

billingRoutes.get("/admin/billing/subscriptions", async (c) => {
  const ownerType = c.req.query("ownerType");
  const ownerId = c.req.query("ownerId");
  const status = c.req.query("status");

  let sql =
    `SELECT id, provider, external_subscription_id, owner_type, owner_id, plan_id, status, amount_cents, currency, billing_interval,
            current_period_start, current_period_end, cancel_at_period_end, metadata, created_at, updated_at
     FROM subscriptions
     WHERE 1 = 1`;
  const binds: Array<string | number> = [];

  if (ownerType) {
    sql += " AND owner_type = ?";
    binds.push(ownerType);
  }
  if (ownerId) {
    sql += " AND owner_id = ?";
    binds.push(ownerId);
  }
  if (status) {
    sql += " AND status = ?";
    binds.push(status);
  }
  sql += " ORDER BY updated_at DESC LIMIT 200";

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<SubscriptionRow>();
  return c.json({
    subscriptions: results.map((s) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(s.metadata);
      } catch {
        metadata = {};
      }
      return {
        id: s.id,
        provider: s.provider,
        externalSubscriptionId: s.external_subscription_id,
        ownerType: s.owner_type,
        ownerId: s.owner_id,
        planId: s.plan_id,
        status: s.status,
        amountCents: s.amount_cents,
        currency: s.currency,
        billingInterval: s.billing_interval,
        currentPeriodStart: s.current_period_start,
        currentPeriodEnd: s.current_period_end,
        cancelAtPeriodEnd: s.cancel_at_period_end === 1,
        metadata,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      };
    }),
  });
});

billingRoutes.post("/admin/billing/subscriptions/upsert", async (c) => {
  let body: {
    provider?: string;
    externalSubscriptionId: string;
    ownerType: "developer" | "organization";
    ownerId: string;
    planId?: string;
    status: string;
    amountCents?: number;
    currency?: string;
    billingInterval?: string;
    currentPeriodStart?: number;
    currentPeriodEnd?: number;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.externalSubscriptionId || !body.ownerType || !body.ownerId || !body.status) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  if (body.ownerType !== "developer" && body.ownerType !== "organization") {
    return c.json({ error: "ownerType must be developer or organization" }, 400);
  }

  if (body.ownerType === "developer") {
    const dev = await c.env.DB.prepare("SELECT id FROM developers WHERE id = ?").bind(body.ownerId).first<{ id: string }>();
    if (!dev) return c.json({ error: "Developer not found" }, 404);
  } else {
    const org = await c.env.DB.prepare("SELECT id FROM organizations WHERE id = ?").bind(body.ownerId).first<{ id: string }>();
    if (!org) return c.json({ error: "Organization not found" }, 404);
  }

  if (body.planId) {
    const plan = await c.env.DB.prepare("SELECT id FROM plans WHERE id = ?").bind(body.planId).first<{ id: string }>();
    if (!plan) return c.json({ error: "Plan not found" }, 404);
  }

  const subscriptionId = generateId();
  const provider = body.provider || "manual";
  const now = Math.floor(Date.now() / 1000);
  const metadataJson = JSON.stringify(body.metadata ?? {});

  await c.env.DB
    .prepare(
      `INSERT INTO subscriptions (
         id, provider, external_subscription_id, owner_type, owner_id, plan_id, status, amount_cents, currency, billing_interval,
         current_period_start, current_period_end, cancel_at_period_end, metadata, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_subscription_id) DO UPDATE SET
         provider = excluded.provider,
         owner_type = excluded.owner_type,
         owner_id = excluded.owner_id,
         plan_id = excluded.plan_id,
         status = excluded.status,
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         billing_interval = excluded.billing_interval,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`
    )
    .bind(
      subscriptionId,
      provider,
      body.externalSubscriptionId,
      body.ownerType,
      body.ownerId,
      body.planId || null,
      body.status,
      body.amountCents ?? 0,
      body.currency || "usd",
      body.billingInterval || "monthly",
      body.currentPeriodStart || null,
      body.currentPeriodEnd || null,
      body.cancelAtPeriodEnd ? 1 : 0,
      metadataJson,
      now,
      now
    )
    .run();

  const adminActor = c.get("adminActor") || "admin";
  await writeAuditLog(c.env.DB, {
    actorType: "admin",
    actorId: adminActor,
    action: "billing.subscription_upserted",
    targetType: "subscription",
    targetId: body.externalSubscriptionId,
    metadata: {
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      planId: body.planId || null,
      status: body.status,
    },
  });

  return c.json({
    externalSubscriptionId: body.externalSubscriptionId,
    ownerType: body.ownerType,
    ownerId: body.ownerId,
    status: body.status,
  });
});

billingRoutes.post("/admin/billing/events/ingest", async (c) => {
  let body: {
    provider?: string;
    eventId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.eventId || !body.eventType) {
    return c.json({ error: "Missing required fields: eventId, eventType" }, 400);
  }

  const provider = body.provider || "manual";
  const payload = JSON.stringify(body.payload ?? {});

  try {
    await c.env.DB
      .prepare(
        `INSERT INTO billing_events (provider, event_id, event_type, payload, processed_at)
         VALUES (?, ?, ?, ?, unixepoch())`
      )
      .bind(provider, body.eventId, body.eventType, payload)
      .run();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ accepted: true, duplicate: true, eventId: body.eventId });
    }
    throw err;
  }

  return c.json({ accepted: true, duplicate: false, eventId: body.eventId });
});

billingRoutes.get("/admin/billing/usage-export", async (c) => {
  const day = c.req.query("day") || new Date().toISOString().slice(0, 10);
  const format = (c.req.query("format") || "json").toLowerCase();

  const { results } = await c.env.DB
    .prepare(
      `SELECT d.id as developer_id,
              d.email as developer_email,
              COUNT(u.id) as total_calls,
              SUM(CASE WHEN u.method IN ('POST','PATCH','DELETE') THEN 1 ELSE 0 END) as write_calls,
              SUM(CASE WHEN u.status_code = 429 THEN 1 ELSE 0 END) as rate_limited_calls
       FROM developers d
       LEFT JOIN api_keys k ON k.developer_id = d.id
       LEFT JOIN api_usage u ON u.api_key = k.key AND date(u.recorded_at, 'unixepoch') = ?
       GROUP BY d.id
       ORDER BY total_calls DESC`
    )
    .bind(day)
    .all<UsageExportRow>();

  const rows = results.map((r) => ({
    developerId: r.developer_id,
    developerEmail: r.developer_email,
    totalCalls: r.total_calls ?? 0,
    writeCalls: r.write_calls ?? 0,
    rateLimitedCalls: r.rate_limited_calls ?? 0,
  }));

  if (format === "csv") {
    const header = "developer_id,developer_email,total_calls,write_calls,rate_limited_calls";
    const lines = rows.map((r) =>
      [r.developerId, r.developerEmail, r.totalCalls, r.writeCalls, r.rateLimitedCalls]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="usage-${day}.csv"`);
    return c.body(csv);
  }

  return c.json({ day, rows });
});
