import type { Context, Next } from "hono";
import type { AppEnv } from "../env.js";

interface RateLimiterOptions {
  bucket: string;
  limit: number;
  windowSeconds: number;
  methods?: string[];
}

interface RateLimitRow {
  count: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const methods = new Set((options.methods ?? ["POST", "PATCH", "DELETE"]).map((m) => m.toUpperCase()));

  return async (c: Context<AppEnv>, next: Next) => {
    if (c.req.method === "OPTIONS") {
      return next();
    }

    if (!methods.has(c.req.method.toUpperCase())) {
      return next();
    }

    const scope = getScope(c);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % options.windowSeconds);
    const id = `${scope.type}:${scope.key}:${options.bucket}:${windowStart}`;

    await c.env.DB.prepare(
      `INSERT INTO rate_limits (id, scope_type, scope_key, bucket, window_start, count, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, unixepoch())
       ON CONFLICT(id) DO UPDATE SET
         count = count + 1,
         updated_at = unixepoch()`
    )
      .bind(id, scope.type, scope.key, options.bucket, windowStart)
      .run();

    const row = await c.env.DB.prepare("SELECT count FROM rate_limits WHERE id = ?")
      .bind(id)
      .first<RateLimitRow>();

    const count = row?.count ?? 1;
    const remaining = Math.max(0, options.limit - count);
    const resetAt = windowStart + options.windowSeconds;
    const retryAfter = Math.max(1, resetAt - now);

    if (count > options.limit) {
      setRateLimitHeaders(c, options.limit, remaining, resetAt, retryAfter);
      return c.json(
        {
          error: "Rate limit exceeded",
          bucket: options.bucket,
          limit: options.limit,
          windowSeconds: options.windowSeconds,
          retryAfter,
        },
        429
      );
    }

    await next();
    setRateLimitHeaders(c, options.limit, remaining, resetAt, retryAfter);
  };
}

export async function cleanupRateLimits(db: D1Database, maxAgeSeconds = 2 * 24 * 60 * 60): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
  await db.prepare("DELETE FROM rate_limits WHERE updated_at < ?").bind(cutoff).run();
}

function getScope(c: Context<AppEnv>): { type: "api_key" | "ip"; key: string } {
  const apiKey = c.get("apiKey");
  if (apiKey) {
    return { type: "api_key", key: apiKey };
  }

  const cfIp = c.req.header("CF-Connecting-IP");
  if (cfIp) {
    return { type: "ip", key: cfIp };
  }

  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) {
    return { type: "ip", key: forwarded.split(",")[0].trim() };
  }

  return { type: "ip", key: "unknown" };
}

function setRateLimitHeaders(
  c: Context<AppEnv>,
  limit: number,
  remaining: number,
  resetAt: number,
  retryAfter: number
): void {
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(resetAt));
  c.header("Retry-After", String(retryAfter));
}
