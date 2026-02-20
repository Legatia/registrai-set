import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { generateApiKey } from "../db.js";
import { writeAuditLog } from "../audit.js";
import { DEFAULT_QUOTA, getEffectiveQuotaForDeveloper, getQuotaSnapshot } from "../quota.js";

export const accountRoutes = new Hono<AppEnv>();

interface DeveloperRow {
  id: string;
  name: string;
  email: string;
  created_at: number;
}

interface ApiKeyRow {
  key: string;
  label: string;
  scopes: string;
  revoked_at: number | null;
  created_at: number;
  last_used_at: number | null;
}

interface OrganizationMembershipRow {
  organization_id: string;
  role: string;
  created_at: number;
  org_name: string;
  org_slug: string;
}

interface OrganizationUsageCountRow {
  calls?: number;
}

interface BillingSubscriptionRow {
  id: string;
  provider: string;
  external_subscription_id: string;
  plan_id: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: number;
  updated_at: number;
}

accountRoutes.get("/me", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const row = await c.env.DB.prepare(
    "SELECT id, name, email, created_at FROM developers WHERE id = ?"
  ).bind(developerId).first<DeveloperRow>();

  if (!row) {
    return c.json({ error: "Developer account not found" }, 404);
  }

  return c.json({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  });
});

accountRoutes.get("/me/organizations", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const { results } = await c.env.DB
    .prepare(
      `SELECT m.organization_id, m.role, m.created_at, o.name as org_name, o.slug as org_slug
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.developer_id = ?
       ORDER BY m.created_at ASC`
    )
    .bind(developerId)
    .all<OrganizationMembershipRow>();

  return c.json({
    organizations: results.map((r) => ({
      organizationId: r.organization_id,
      name: r.org_name,
      slug: r.org_slug,
      role: r.role,
      joinedAt: r.created_at,
    })),
  });
});

accountRoutes.get("/me/organizations/:organizationId/usage", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const organizationId = c.req.param("organizationId");
  const membership = await c.env.DB
    .prepare("SELECT role FROM organization_members WHERE organization_id = ? AND developer_id = ?")
    .bind(organizationId, developerId)
    .first<{ role: string }>();
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const org = await c.env.DB
    .prepare("SELECT id, name, slug, created_at FROM organizations WHERE id = ?")
    .bind(organizationId)
    .first<{ id: string; name: string; slug: string; created_at: number }>();
  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  const [totalResult, dailyResult, byDeveloperResult, byEndpointResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COUNT(*) as calls
       FROM api_usage
       WHERE recorded_at > ?
         AND api_key IN (
           SELECT key FROM api_keys WHERE developer_id IN (
             SELECT developer_id FROM organization_members WHERE organization_id = ?
           )
         )`
    ).bind(thirtyDaysAgo, organizationId),
    c.env.DB.prepare(
      `SELECT date(u.recorded_at, 'unixepoch') as day, COUNT(*) as calls
       FROM api_usage u
       WHERE u.recorded_at > ?
         AND u.api_key IN (
           SELECT key FROM api_keys WHERE developer_id IN (
             SELECT developer_id FROM organization_members WHERE organization_id = ?
           )
         )
       GROUP BY day
       ORDER BY day DESC`
    ).bind(thirtyDaysAgo, organizationId),
    c.env.DB.prepare(
      `SELECT d.id as developer_id, d.name, d.email, COUNT(*) as calls
       FROM api_usage u
       JOIN api_keys k ON k.key = u.api_key
       JOIN developers d ON d.id = k.developer_id
       WHERE u.recorded_at > ?
         AND d.id IN (SELECT developer_id FROM organization_members WHERE organization_id = ?)
       GROUP BY d.id
       ORDER BY calls DESC`
    ).bind(thirtyDaysAgo, organizationId),
    c.env.DB.prepare(
      `SELECT u.method, u.path, COUNT(*) as calls
       FROM api_usage u
       WHERE u.recorded_at > ?
         AND u.api_key IN (
           SELECT key FROM api_keys WHERE developer_id IN (
             SELECT developer_id FROM organization_members WHERE organization_id = ?
           )
         )
       GROUP BY u.method, u.path
       ORDER BY calls DESC
       LIMIT 50`
    ).bind(thirtyDaysAgo, organizationId),
  ]);

  const totalCalls = (totalResult.results[0] as OrganizationUsageCountRow | undefined)?.calls ?? 0;
  return c.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.created_at,
      role: membership.role,
    },
    period: "last_30_days",
    totalCalls,
    daily: dailyResult.results,
    byDeveloper: byDeveloperResult.results.map((r) => ({
      developerId: (r as { developer_id: string }).developer_id,
      name: (r as { name: string }).name,
      email: (r as { email: string }).email,
      calls: (r as { calls: number }).calls,
    })),
    byEndpoint: byEndpointResult.results,
  });
});

accountRoutes.get("/me/keys", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const { results } = await c.env.DB
    .prepare(
      `SELECT k.key, k.label, k.scopes, k.revoked_at, k.created_at, MAX(u.recorded_at) as last_used_at
       FROM api_keys k
       LEFT JOIN api_usage u ON u.api_key = k.key
       WHERE k.developer_id = ?
       GROUP BY k.key
       ORDER BY k.created_at DESC`
    )
    .bind(developerId)
    .all<ApiKeyRow>();

  return c.json({
    keys: results.map((k) => ({
      keyId: k.key,
      key: `${k.key.slice(0, 8)}...${k.key.slice(-4)}`,
      label: k.label,
      scopes: k.scopes,
      active: k.revoked_at === null,
      createdAt: k.created_at,
      revokedAt: k.revoked_at,
      lastUsedAt: k.last_used_at,
    })),
  });
});

accountRoutes.post("/me/keys", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  let body: { label?: string; scopes?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // optional body
  }

  const key = generateApiKey();
  const label = (body.label || "self-issued").trim().slice(0, 100);
  const scopes = (body.scopes || "read,write").trim().slice(0, 200);

  await c.env.DB
    .prepare("INSERT INTO api_keys (key, developer_id, label, scopes) VALUES (?, ?, ?, ?)")
    .bind(key, developerId, label, scopes)
    .run();

  await writeAuditLog(c.env.DB, {
    actorType: "developer",
    actorId: developerId,
    action: "api_key.created",
    targetType: "api_key",
    targetId: key,
    metadata: { label, scopes, source: "developer_self_service" },
  });

  return c.json(
    {
      key,
      keyMasked: `${key.slice(0, 8)}...${key.slice(-4)}`,
      label,
      scopes,
      developerId,
    },
    201
  );
});

accountRoutes.post("/me/keys/rotate", async (c) => {
  const developerId = c.get("developerId");
  const currentApiKey = c.get("apiKey");
  if (!developerId || developerId === "__legacy__" || !currentApiKey) {
    return c.json({ error: "Developer API key required" }, 403);
  }

  let body: { label?: string; scopes?: string; revokeCurrent?: boolean } = {};
  try {
    body = await c.req.json();
  } catch {
    // optional body
  }

  const newKey = generateApiKey();
  const label = (body.label || "rotated").trim().slice(0, 100);
  const scopes = (body.scopes || "read,write").trim().slice(0, 200);
  const revokeCurrent = body.revokeCurrent ?? true;

  await c.env.DB.batch([
    c.env.DB
      .prepare("INSERT INTO api_keys (key, developer_id, label, scopes) VALUES (?, ?, ?, ?)")
      .bind(newKey, developerId, label, scopes),
    revokeCurrent
      ? c.env.DB
          .prepare("UPDATE api_keys SET revoked_at = unixepoch() WHERE key = ? AND developer_id = ? AND revoked_at IS NULL")
          .bind(currentApiKey, developerId)
      : c.env.DB.prepare("SELECT 1"),
  ]);

  await writeAuditLog(c.env.DB, {
    actorType: "developer",
    actorId: developerId,
    action: "api_key.rotated",
    targetType: "api_key",
    targetId: newKey,
    metadata: { revokeCurrent, previousKeyMasked: `${currentApiKey.slice(0, 8)}...${currentApiKey.slice(-4)}` },
  });

  return c.json(
    {
      key: newKey,
      keyMasked: `${newKey.slice(0, 8)}...${newKey.slice(-4)}`,
      revokedCurrent: revokeCurrent,
    },
    201
  );
});

accountRoutes.delete("/me/keys/:keyId", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const keyId = c.req.param("keyId");
  const result = await c.env.DB
    .prepare("UPDATE api_keys SET revoked_at = unixepoch() WHERE key = ? AND developer_id = ? AND revoked_at IS NULL")
    .bind(keyId, developerId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Key not found or already revoked" }, 404);
  }

  await writeAuditLog(c.env.DB, {
    actorType: "developer",
    actorId: developerId,
    action: "api_key.revoked",
    targetType: "api_key",
    targetId: keyId,
    metadata: { source: "developer_self_service" },
  });

  return c.json({ message: "API key revoked" });
});

accountRoutes.get("/me/usage", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  const [dailyResult, endpointResult, totalResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT date(recorded_at, 'unixepoch') as day, COUNT(*) as calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at > ?
       GROUP BY day ORDER BY day DESC`
    ).bind(developerId, thirtyDaysAgo),
    c.env.DB.prepare(
      `SELECT method, path, COUNT(*) as calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at > ?
       GROUP BY method, path ORDER BY calls DESC LIMIT 50`
    ).bind(developerId, thirtyDaysAgo),
    c.env.DB.prepare(
      `SELECT COUNT(*) as calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at > ?`
    ).bind(developerId, thirtyDaysAgo),
  ]);

  const total = (totalResult.results[0] as { calls?: number } | undefined)?.calls ?? 0;

  return c.json({
    developerId,
    period: "last_30_days",
    totalCalls: total,
    daily: dailyResult.results,
    byEndpoint: endpointResult.results,
  });
});

accountRoutes.get("/me/quota", async (c) => {
  const developerId = c.get("developerId");
  const apiKey = c.get("apiKey");
  if (!developerId || developerId === "__legacy__" || !apiKey) {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const effective = await getEffectiveQuotaForDeveloper(c.env.DB, developerId);
  const snapshot = await getQuotaSnapshot(c.env.DB, apiKey, effective.quota || DEFAULT_QUOTA);
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  const [rateLimitedCount, rateLimitedByPath] = await c.env.DB.batch([
    c.env.DB
      .prepare("SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND status_code = 429 AND recorded_at > ?")
      .bind(apiKey, oneDayAgo),
    c.env.DB
      .prepare(
        `SELECT method, path, COUNT(*) as hits
         FROM api_usage
         WHERE api_key = ? AND status_code = 429 AND recorded_at > ?
         GROUP BY method, path
         ORDER BY hits DESC
         LIMIT 10`
      )
      .bind(apiKey, oneDayAgo),
  ]);

  const rateLimitedLast24h = (rateLimitedCount.results[0] as { cnt?: number } | undefined)?.cnt ?? 0;

  return c.json({
    keyMasked: `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`,
    plan: effective.plan,
    quota: {
      total: {
        limit: snapshot.limits.totalPerDay,
        used: snapshot.totalUsed,
        remaining: snapshot.totalRemaining,
      },
      write: {
        limit: snapshot.limits.writePerDay,
        used: snapshot.writeUsed,
        remaining: snapshot.writeRemaining,
      },
      feedbackSubmit: {
        limit: snapshot.limits.feedbackSubmitPerDay,
        used: snapshot.feedbackUsed,
        remaining: snapshot.feedbackRemaining,
      },
      resetAt: snapshot.dayEnd,
    },
    rateLimit: {
      last24h429: rateLimitedLast24h,
      byEndpoint: rateLimitedByPath.results,
    },
  });
});

accountRoutes.get("/me/plan", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const effective = await getEffectiveQuotaForDeveloper(c.env.DB, developerId);
  return c.json({
    developerId,
    plan: effective.plan,
    effectiveQuota: effective.quota,
  });
});

accountRoutes.get("/me/billing", async (c) => {
  const developerId = c.get("developerId");
  if (!developerId || developerId === "__legacy__") {
    return c.json({ error: "Developer API key required" }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const subscription = await c.env.DB
    .prepare(
      `SELECT id, provider, external_subscription_id, plan_id, status, amount_cents, currency, billing_interval,
              current_period_start, current_period_end, cancel_at_period_end, updated_at
       FROM subscriptions
       WHERE owner_type = 'developer'
         AND owner_id = ?
         AND (status = 'active' OR status = 'trialing' OR status = 'past_due')
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .bind(developerId)
    .first<BillingSubscriptionRow>();

  const dayStart = now - (now % 86400);
  const dayEnd = dayStart + 86400;
  const usage = await c.env.DB
    .prepare(
      `SELECT COUNT(*) as total_calls,
              SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) as rate_limited_calls
       FROM api_usage
       WHERE api_key IN (SELECT key FROM api_keys WHERE developer_id = ?)
         AND recorded_at >= ?
         AND recorded_at < ?`
    )
    .bind(developerId, dayStart, dayEnd)
    .first<{ total_calls?: number; rate_limited_calls?: number }>();

  return c.json({
    developerId,
    subscription: subscription
      ? {
          id: subscription.id,
          provider: subscription.provider,
          externalSubscriptionId: subscription.external_subscription_id,
          status: subscription.status,
          amountCents: subscription.amount_cents,
          currency: subscription.currency,
          billingInterval: subscription.billing_interval,
          planId: subscription.plan_id,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
          updatedAt: subscription.updated_at,
        }
      : null,
    today: {
      totalCalls: usage?.total_calls ?? 0,
      rateLimitedCalls: usage?.rate_limited_calls ?? 0,
      dayStart,
      dayEnd,
    },
  });
});
