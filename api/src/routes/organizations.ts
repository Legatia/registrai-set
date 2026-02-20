import { Hono } from "hono";
import { generateId } from "../db.js";
import { writeAuditLog } from "../audit.js";
import type { AppEnv } from "../env.js";

export const organizationRoutes = new Hono<AppEnv>();

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: number;
  member_count?: number;
}

interface MemberRow {
  developer_id: string;
  role: string;
  created_at: number;
  name: string;
  email: string;
}

interface UsageCountRow {
  calls?: number;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

organizationRoutes.get("/organizations", async (c) => {
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const offset = (page - 1) * limit;

  const [countRes, rowsRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM organizations"),
    c.env.DB
      .prepare(
        `SELECT o.id, o.name, o.slug, o.created_at, COUNT(m.developer_id) as member_count
         FROM organizations o
         LEFT JOIN organization_members m ON m.organization_id = o.id
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(limit, offset),
  ]);

  const total = (countRes.results[0] as { cnt?: number } | undefined)?.cnt ?? 0;
  return c.json({
    organizations: rowsRes.results.map((r) => {
      const row = r as OrganizationRow;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: row.created_at,
        memberCount: row.member_count ?? 0,
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

organizationRoutes.post("/organizations", async (c) => {
  let body: { name: string; slug?: string; ownerDeveloperId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: "Missing required field: name" }, 400);
  }

  const slug = normalizeSlug(body.slug || name);
  if (!slug) {
    return c.json({ error: "Invalid slug" }, 400);
  }

  const orgId = generateId();
  const adminActor = c.get("adminActor") || "admin";

  try {
    await c.env.DB
      .prepare("INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)")
      .bind(orgId, name, slug)
      .run();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "Organization slug already exists" }, 409);
    }
    throw err;
  }

  if (body.ownerDeveloperId) {
    const owner = await c.env.DB
      .prepare("SELECT id FROM developers WHERE id = ?")
      .bind(body.ownerDeveloperId)
      .first<{ id: string }>();
    if (owner) {
      await c.env.DB
        .prepare("INSERT INTO organization_members (organization_id, developer_id, role) VALUES (?, ?, 'owner')")
        .bind(orgId, owner.id)
        .run();
    }
  }

  await writeAuditLog(c.env.DB, {
    actorType: "admin",
    actorId: adminActor,
    action: "organization.created",
    targetType: "organization",
    targetId: orgId,
    metadata: { name, slug, ownerDeveloperId: body.ownerDeveloperId || null },
  });

  return c.json({ id: orgId, name, slug }, 201);
});

organizationRoutes.get("/organizations/:id/members", async (c) => {
  const id = c.req.param("id");
  const org = await c.env.DB
    .prepare("SELECT id, name, slug, created_at FROM organizations WHERE id = ?")
    .bind(id)
    .first<OrganizationRow>();
  if (!org) return c.json({ error: "Organization not found" }, 404);

  const { results } = await c.env.DB
    .prepare(
      `SELECT m.developer_id, m.role, m.created_at, d.name, d.email
       FROM organization_members m
       JOIN developers d ON d.id = m.developer_id
       WHERE m.organization_id = ?
       ORDER BY m.created_at ASC`
    )
    .bind(id)
    .all<MemberRow>();

  return c.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.created_at,
    },
    members: results.map((m) => ({
      developerId: m.developer_id,
      role: m.role,
      joinedAt: m.created_at,
      name: m.name,
      email: m.email,
    })),
  });
});

organizationRoutes.post("/organizations/:id/members", async (c) => {
  const id = c.req.param("id");
  let body: { developerId: string; role?: "owner" | "admin" | "member" };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.developerId) {
    return c.json({ error: "Missing required field: developerId" }, 400);
  }

  const role = body.role || "member";
  if (!["owner", "admin", "member"].includes(role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  const [org, dev] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id FROM organizations WHERE id = ?").bind(id),
    c.env.DB.prepare("SELECT id FROM developers WHERE id = ?").bind(body.developerId),
  ]);

  if (org.results.length === 0) return c.json({ error: "Organization not found" }, 404);
  if (dev.results.length === 0) return c.json({ error: "Developer not found" }, 404);

  await c.env.DB
    .prepare(
      `INSERT INTO organization_members (organization_id, developer_id, role)
       VALUES (?, ?, ?)
       ON CONFLICT(organization_id, developer_id) DO UPDATE SET role = excluded.role`
    )
    .bind(id, body.developerId, role)
    .run();

  const adminActor = c.get("adminActor") || "admin";
  await writeAuditLog(c.env.DB, {
    actorType: "admin",
    actorId: adminActor,
    action: "organization.member_upserted",
    targetType: "organization",
    targetId: id,
    metadata: { developerId: body.developerId, role },
  });

  return c.json({ organizationId: id, developerId: body.developerId, role });
});

organizationRoutes.delete("/organizations/:id/members/:developerId", async (c) => {
  const id = c.req.param("id");
  const developerId = c.req.param("developerId");

  const result = await c.env.DB
    .prepare("DELETE FROM organization_members WHERE organization_id = ? AND developer_id = ?")
    .bind(id, developerId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Membership not found" }, 404);
  }

  const adminActor = c.get("adminActor") || "admin";
  await writeAuditLog(c.env.DB, {
    actorType: "admin",
    actorId: adminActor,
    action: "organization.member_removed",
    targetType: "organization",
    targetId: id,
    metadata: { developerId },
  });

  return c.json({ message: "Member removed", organizationId: id, developerId });
});

organizationRoutes.get("/organizations/:id/usage", async (c) => {
  const id = c.req.param("id");
  const org = await c.env.DB
    .prepare("SELECT id, name, slug, created_at FROM organizations WHERE id = ?")
    .bind(id)
    .first<OrganizationRow>();
  if (!org) return c.json({ error: "Organization not found" }, 404);

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
    ).bind(thirtyDaysAgo, id),
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
    ).bind(thirtyDaysAgo, id),
    c.env.DB.prepare(
      `SELECT d.id as developer_id, d.name, d.email, COUNT(*) as calls
       FROM api_usage u
       JOIN api_keys k ON k.key = u.api_key
       JOIN developers d ON d.id = k.developer_id
       WHERE u.recorded_at > ?
         AND d.id IN (SELECT developer_id FROM organization_members WHERE organization_id = ?)
       GROUP BY d.id
       ORDER BY calls DESC`
    ).bind(thirtyDaysAgo, id),
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
    ).bind(thirtyDaysAgo, id),
  ]);

  const totalCalls = (totalResult.results[0] as UsageCountRow | undefined)?.calls ?? 0;

  return c.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.created_at,
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
