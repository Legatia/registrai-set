import { KYAClient } from "./client.js";
import type { TrustCheckResult, TrustGateOptions } from "./types.js";

// ── TTL Cache ────────────────────────────────────────────────

interface CacheEntry {
  result: TrustCheckResult;
  expiresAt: number;
}

class TrustCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(agentId: string): TrustCheckResult | undefined {
    const entry = this.store.get(agentId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(agentId);
      return undefined;
    }
    return entry.result;
  }

  set(agentId: string, result: TrustCheckResult): void {
    this.store.set(agentId, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

// ── Core Trust Gate ──────────────────────────────────────────

type MiddlewareFn = (req: any, res: any, next: any) => Promise<void>;

/**
 * Framework-agnostic trust gate middleware factory.
 * Returns an Express-style `(req, res, next)` function.
 */
export function createTrustGate(
  client: KYAClient,
  options: TrustGateOptions,
): MiddlewareFn {
  const cache = options.cache
    ? new TrustCache(options.cache.ttlMs)
    : null;

  return async (req: any, res: any, next: any) => {
    const agentId = options.extractAgentId(req);
    if (!agentId) {
      return next();
    }

    // Check cache
    if (cache) {
      const cached = cache.get(agentId);
      if (cached) {
        if (cached.trusted) {
          req.kyaTrust = cached;
          return next();
        }
        if (options.onDenied) {
          return options.onDenied(cached, req, res);
        }
        res.writeHead?.(403, { "Content-Type": "application/json" });
        res.end?.(JSON.stringify({ error: "Agent not trusted", ...cached }));
        return;
      }
    }

    let result: TrustCheckResult;
    try {
      result = await client.isAgentTrusted(agentId, {
        minScore: options.minScore,
        minFeedback: options.minFeedback,
      });
    } catch (err) {
      if (options.onError) {
        return options.onError(err, req, res);
      }
      res.writeHead?.(503, { "Content-Type": "application/json" });
      res.end?.(JSON.stringify({ error: "Trust check unavailable" }));
      return;
    }

    // Populate cache
    if (cache) {
      cache.set(agentId, result);
    }

    if (result.trusted) {
      req.kyaTrust = result;
      return next();
    }

    if (options.onDenied) {
      return options.onDenied(result, req, res);
    }
    res.writeHead?.(403, { "Content-Type": "application/json" });
    res.end?.(JSON.stringify({ error: "Agent not trusted", ...result }));
  };
}

// ── Express convenience wrapper ──────────────────────────────

/**
 * Express-compatible middleware: `(req, res, next) => void`
 */
export function expressGate(
  client: KYAClient,
  options: TrustGateOptions,
): MiddlewareFn {
  return createTrustGate(client, options);
}

// ── Hono convenience wrapper ─────────────────────────────────

/**
 * Hono-compatible middleware: `(c, next) => Promise<void|Response>`
 * Adapts to Hono's Context API (c.req, c.json, c.set).
 */
export function honoGate(
  client: KYAClient,
  options: TrustGateOptions,
): (c: any, next: any) => Promise<any> {
  const cache = options.cache
    ? new TrustCache(options.cache.ttlMs)
    : null;

  return async (c: any, next: any) => {
    const agentId = options.extractAgentId(c.req);
    if (!agentId) return next();

    // Check cache
    if (cache) {
      const cached = cache.get(agentId);
      if (cached) {
        if (cached.trusted) {
          c.set("kyaTrust", cached);
          return next();
        }
        if (options.onDenied) {
          return options.onDenied(cached, c.req, c);
        }
        return c.json({ error: "Agent not trusted", ...cached }, 403);
      }
    }

    let result: TrustCheckResult;
    try {
      result = await client.isAgentTrusted(agentId, {
        minScore: options.minScore,
        minFeedback: options.minFeedback,
      });
    } catch (err) {
      if (options.onError) {
        return options.onError(err, c.req, c);
      }
      return c.json({ error: "Trust check unavailable" }, 503);
    }

    if (cache) {
      cache.set(agentId, result);
    }

    if (result.trusted) {
      c.set("kyaTrust", result);
      return next();
    }

    if (options.onDenied) {
      return options.onDenied(result, c.req, c);
    }
    return c.json({ error: "Agent not trusted", ...result }, 403);
  };
}
