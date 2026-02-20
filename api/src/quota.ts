export interface QuotaConfig {
  totalPerDay: number;
  writePerDay: number;
  feedbackSubmitPerDay: number;
}

export const DEFAULT_QUOTA: QuotaConfig = {
  totalPerDay: 10_000,
  writePerDay: 2_000,
  feedbackSubmitPerDay: 500,
};

interface CountRow {
  cnt: number;
}

export interface QuotaSnapshot {
  now: number;
  dayStart: number;
  dayEnd: number;
  totalUsed: number;
  writeUsed: number;
  feedbackUsed: number;
  totalRemaining: number;
  writeRemaining: number;
  feedbackRemaining: number;
  limits: QuotaConfig;
}

export interface EffectiveQuota {
  quota: QuotaConfig;
  plan: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    billingInterval: string;
  } | null;
}

interface PlanQuotaRow {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  total_per_day: number;
  write_per_day: number;
  feedback_submit_per_day: number;
}

export function isWriteMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PATCH" || normalized === "DELETE";
}

export function isFeedbackSubmitRoute(method: string, path: string): boolean {
  return method.toUpperCase() === "POST" && /^\/agents\/[^/]+\/feedback$/.test(path);
}

export async function getEffectiveQuotaForDeveloper(
  db: D1Database,
  developerId: string
): Promise<EffectiveQuota> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.slug, p.price_cents, p.billing_interval, p.total_per_day, p.write_per_day, p.feedback_submit_per_day
       FROM developer_plan_assignments a
       JOIN plans p ON p.id = a.plan_id
       WHERE a.developer_id = ?
         AND a.starts_at <= ?
         AND (a.ends_at IS NULL OR a.ends_at > ?)
         AND p.is_active = 1
       ORDER BY a.starts_at DESC
       LIMIT 1`
    )
    .bind(developerId, now, now)
    .first<PlanQuotaRow>();

  if (!row) {
    return { quota: DEFAULT_QUOTA, plan: null };
  }

  return {
    quota: {
      totalPerDay: row.total_per_day,
      writePerDay: row.write_per_day,
      feedbackSubmitPerDay: row.feedback_submit_per_day,
    },
    plan: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      priceCents: row.price_cents,
      billingInterval: row.billing_interval,
    },
  };
}

export async function getQuotaSnapshot(
  db: D1Database,
  apiKey: string,
  config: QuotaConfig = DEFAULT_QUOTA
): Promise<QuotaSnapshot> {
  const now = Math.floor(Date.now() / 1000);
  const dayStart = now - (now % 86400);
  const dayEnd = dayStart + 86400;

  const [totalRow, writeRow, feedbackRow] = await db.batch([
    db.prepare("SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND recorded_at >= ? AND recorded_at < ?")
      .bind(apiKey, dayStart, dayEnd),
    db.prepare(
      "SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND method IN ('POST','PATCH','DELETE') AND recorded_at >= ? AND recorded_at < ?"
    ).bind(apiKey, dayStart, dayEnd),
    db.prepare(
      "SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND method = 'POST' AND path GLOB '/agents/*/feedback' AND recorded_at >= ? AND recorded_at < ?"
    ).bind(apiKey, dayStart, dayEnd),
  ]);

  const totalUsed = (totalRow.results[0] as CountRow | undefined)?.cnt ?? 0;
  const writeUsed = (writeRow.results[0] as CountRow | undefined)?.cnt ?? 0;
  const feedbackUsed = (feedbackRow.results[0] as CountRow | undefined)?.cnt ?? 0;

  return {
    now,
    dayStart,
    dayEnd,
    totalUsed,
    writeUsed,
    feedbackUsed,
    totalRemaining: Math.max(0, config.totalPerDay - totalUsed),
    writeRemaining: Math.max(0, config.writePerDay - writeUsed),
    feedbackRemaining: Math.max(0, config.feedbackSubmitPerDay - feedbackUsed),
    limits: config,
  };
}
