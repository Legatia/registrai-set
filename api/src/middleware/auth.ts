import type { Context, Next } from "hono";
import type { AppEnv } from "../env.js";
import { writeAuditLog } from "../audit.js";

interface ApiKeyRow {
  key: string;
  developer_id: string;
  scopes: string;
  revoked_at: number | null;
}

interface AuthContext {
  apiKey: string;
  developerId: string;
}

/**
 * Auth middleware: validates developer API keys.
 * - OPTIONS always passes through.
 * - GET requests are public, but attach developer context if a valid X-API-Key is provided.
 * - Non-GET requests require a valid developer key.
 */
export function apiKeyAuth() {
  return async (c: Context<AppEnv>, next: Next) => {
    const method = c.req.method;
    const isReadOnly = method === "GET" || method === "OPTIONS";

    if (method === "OPTIONS") {
      return next();
    }

    // Public non-custodial registration writes do not require developer API keys.
    if (
      method === "POST" &&
      (c.req.path === "/agents/register/build" || c.req.path === "/agents/register/confirm")
    ) {
      return next();
    }

    const headerKey = c.req.header("X-API-Key");
    let auth: AuthContext | null = null;
    if (headerKey) {
      auth = await authenticateApiKey(c, headerKey);
    }

    // Public reads: continue even without API key; attach context when key is valid.
    if (isReadOnly) {
      if (auth) {
        c.set("apiKey", auth.apiKey);
        c.set("developerId", auth.developerId);
      }
      await next();
      if (auth) {
        await logUsage(c, auth.apiKey);
      }
      return;
    }

    if (!auth) {
      return c.json({ error: "Unauthorized — missing or invalid API key" }, 401);
    }

    c.set("apiKey", auth.apiKey);
    c.set("developerId", auth.developerId);

    await next();
    await logUsage(c, auth.apiKey);
  };
}

async function authenticateApiKey(c: Context<AppEnv>, headerKey: string): Promise<AuthContext | null> {
  // Legacy env var fallback
  const legacyApiKey = c.env.API_KEY;
  if (legacyApiKey && headerKey === legacyApiKey) {
    return { apiKey: headerKey, developerId: "__legacy__" };
  }

  // Look up in api_keys table
  const row = await c.env.DB.prepare(
    "SELECT key, developer_id, scopes, revoked_at FROM api_keys WHERE key = ?"
  ).bind(headerKey).first<ApiKeyRow>();

  if (!row || row.revoked_at !== null) {
    return null;
  }

  return { apiKey: row.key, developerId: row.developer_id };
}

async function logUsage(c: Context<AppEnv>, apiKey: string): Promise<void> {
  // Fire-and-forget usage logging
  try {
    await c.env.DB.prepare(
      "INSERT INTO api_usage (api_key, method, path, status_code) VALUES (?, ?, ?, ?)"
    ).bind(apiKey, c.req.method, c.req.path, c.res.status).run();
  } catch {
    // non-critical
  }
}

/**
 * Admin-only middleware: requires X-Admin-Key header matching ADMIN_KEY env var.
 */
export function adminAuth() {
  return async (c: Context<AppEnv>, next: Next) => {
    const adminKey = c.env.ADMIN_KEY;
    if (!adminKey) {
      return c.json({ error: "Admin endpoints not configured" }, 503);
    }
    const receivedKey = c.req.header("X-Admin-Key");
    if (receivedKey !== adminKey) {
      await writeAuditLog(c.env.DB, {
        actorType: "system",
        actorId: "auth",
        action: "admin_auth.failed",
        targetType: "route",
        targetId: c.req.path,
        metadata: {
          ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
          method: c.req.method,
        },
      });
      return c.json({ error: "Unauthorized — invalid admin key" }, 401);
    }
    c.set("adminActor", `admin:${adminKey.slice(0, 6)}`);
    return next();
  };
}
