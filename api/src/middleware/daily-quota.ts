import type { Context, Next } from "hono";
import type { AppEnv } from "../env.js";

interface QuotaConfig {
  totalPerDay: number;
  writePerDay: number;
  feedbackSubmitPerDay: number;
}

const DEFAULT_QUOTA: QuotaConfig = {
  totalPerDay: 10_000,
  writePerDay: 2_000,
  feedbackSubmitPerDay: 500,
};

interface CountRow {
  cnt: number;
}

export function dailyQuota(config: Partial<QuotaConfig> = {}) {
  const quota: QuotaConfig = { ...DEFAULT_QUOTA, ...config };

  return async (c: Context<AppEnv>, next: Next) => {
    const apiKey = c.get("apiKey");
    const developerId = c.get("developerId");

    // Quotas are API-key based. Public unauthenticated traffic is handled by IP limits.
    if (!apiKey || developerId === "__legacy__") {
      return next();
    }

    if (c.req.method === "OPTIONS") {
      return next();
    }

    const now = Math.floor(Date.now() / 1000);
    const dayStart = now - (now % 86400);
    const dayEnd = dayStart + 86400;

    const isWrite = c.req.method === "POST" || c.req.method === "PATCH" || c.req.method === "DELETE";
    const isFeedbackSubmit = c.req.method === "POST" && /^\/agents\/[^/]+\/feedback$/.test(c.req.path);

    // Count prior usage for this UTC day from api_usage.
    const [totalRow, writeRow, feedbackRow] = await c.env.DB.batch([
      c.env.DB
        .prepare("SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND recorded_at >= ? AND recorded_at < ?")
        .bind(apiKey, dayStart, dayEnd),
      c.env.DB
        .prepare(
          "SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND method IN ('POST','PATCH','DELETE') AND recorded_at >= ? AND recorded_at < ?"
        )
        .bind(apiKey, dayStart, dayEnd),
      c.env.DB
        .prepare(
          "SELECT COUNT(*) as cnt FROM api_usage WHERE api_key = ? AND method = 'POST' AND path GLOB '/agents/*/feedback' AND recorded_at >= ? AND recorded_at < ?"
        )
        .bind(apiKey, dayStart, dayEnd),
    ]);

    const totalUsed = ((totalRow.results[0] as CountRow | undefined)?.cnt ?? 0);
    const writeUsed = ((writeRow.results[0] as CountRow | undefined)?.cnt ?? 0);
    const feedbackUsed = ((feedbackRow.results[0] as CountRow | undefined)?.cnt ?? 0);

    if (totalUsed >= quota.totalPerDay) {
      return quotaExceeded(c, "total_daily", quota.totalPerDay, 0, dayEnd - now);
    }

    if (isWrite && writeUsed >= quota.writePerDay) {
      return quotaExceeded(c, "write_daily", quota.writePerDay, 0, dayEnd - now);
    }

    if (isFeedbackSubmit && feedbackUsed >= quota.feedbackSubmitPerDay) {
      return quotaExceeded(c, "feedback_submit_daily", quota.feedbackSubmitPerDay, 0, dayEnd - now);
    }

    const remaining = Math.max(0, quota.totalPerDay - totalUsed - 1);
    const writeRemaining = Math.max(0, quota.writePerDay - writeUsed - (isWrite ? 1 : 0));
    const feedbackRemaining = Math.max(0, quota.feedbackSubmitPerDay - feedbackUsed - (isFeedbackSubmit ? 1 : 0));
    setQuotaHeaders(c, quota, remaining, writeRemaining, feedbackRemaining, dayEnd);

    return next();
  };
}

function quotaExceeded(
  c: Context<AppEnv>,
  bucket: "total_daily" | "write_daily" | "feedback_submit_daily",
  limit: number,
  remaining: number,
  retryAfter: number
) {
  c.header("X-Quota-Bucket", bucket);
  c.header("X-Quota-Daily-Limit", String(limit));
  c.header("X-Quota-Daily-Remaining", String(remaining));
  c.header("Retry-After", String(Math.max(1, retryAfter)));

  return c.json(
    {
      error: "Daily quota exceeded",
      bucket,
      limit,
      remaining,
      retryAfter: Math.max(1, retryAfter),
    },
    429
  );
}

function setQuotaHeaders(
  c: Context<AppEnv>,
  quota: QuotaConfig,
  totalRemaining: number,
  writeRemaining: number,
  feedbackRemaining: number,
  resetAt: number
) {
  c.header("X-Quota-Daily-Limit", String(quota.totalPerDay));
  c.header("X-Quota-Daily-Remaining", String(totalRemaining));
  c.header("X-Quota-Write-Limit", String(quota.writePerDay));
  c.header("X-Quota-Write-Remaining", String(writeRemaining));
  c.header("X-Quota-Feedback-Limit", String(quota.feedbackSubmitPerDay));
  c.header("X-Quota-Feedback-Remaining", String(feedbackRemaining));
  c.header("X-Quota-Reset", String(resetAt));
}
