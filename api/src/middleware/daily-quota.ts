import type { Context, Next } from "hono";
import type { AppEnv } from "../env.js";
import {
  DEFAULT_QUOTA,
  type QuotaConfig,
  getEffectiveQuotaForDeveloper,
  getQuotaSnapshot,
  isFeedbackSubmitRoute,
  isWriteMethod,
} from "../quota.js";

export function dailyQuota(config: Partial<QuotaConfig> = {}) {
  const quota: QuotaConfig = { ...DEFAULT_QUOTA, ...config };
  const hasOverride = Object.keys(config).length > 0;

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

    const effective = !hasOverride ? await getEffectiveQuotaForDeveloper(c.env.DB, developerId) : { quota, plan: null };
    const appliedQuota = effective.quota;
    const snapshot = await getQuotaSnapshot(c.env.DB, apiKey, appliedQuota);
    const isWrite = isWriteMethod(c.req.method);
    const isFeedbackSubmit = isFeedbackSubmitRoute(c.req.method, c.req.path);

    if (snapshot.totalUsed >= appliedQuota.totalPerDay) {
      return quotaExceeded(c, "total_daily", appliedQuota.totalPerDay, 0, snapshot.dayEnd - snapshot.now);
    }

    if (isWrite && snapshot.writeUsed >= appliedQuota.writePerDay) {
      return quotaExceeded(c, "write_daily", appliedQuota.writePerDay, 0, snapshot.dayEnd - snapshot.now);
    }

    if (isFeedbackSubmit && snapshot.feedbackUsed >= appliedQuota.feedbackSubmitPerDay) {
      return quotaExceeded(c, "feedback_submit_daily", appliedQuota.feedbackSubmitPerDay, 0, snapshot.dayEnd - snapshot.now);
    }

    if (effective.plan) {
      c.header("X-Plan-Slug", effective.plan.slug);
    }

    const totalRemaining = Math.max(0, snapshot.totalRemaining - 1);
    const writeRemaining = Math.max(0, snapshot.writeRemaining - (isWrite ? 1 : 0));
    const feedbackRemaining = Math.max(0, snapshot.feedbackRemaining - (isFeedbackSubmit ? 1 : 0));
    setQuotaHeaders(c, appliedQuota, totalRemaining, writeRemaining, feedbackRemaining, snapshot.dayEnd);

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
