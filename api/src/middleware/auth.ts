import type { Context, Next } from "hono";
import type { AppEnv } from "../env.js";

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
 * Auth middleware: validates developer API keys for all endpoints.
 * OPTIONS passes through for CORS preflight. Everything else requires
 * a valid, non-revoked key from the api_keys table OR the legacy API_KEY env var.
 */
export function apiKeyAuth() {
  return async (c: Context<AppEnv>, next: Next) => {
    // CORS preflight always passes
    if (c.req.method === "OPTIONS") {
      return next();
    }

    const headerKey = c.req.header("X-API-Key");
    let auth: AuthContext | null = null;
    if (headerKey) {
      auth = await authenticateApiKey(c, headerKey);
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
    if (c.req.header("X-Admin-Key") !== adminKey) {
      return c.json({ error: "Unauthorized — invalid admin key" }, 401);
    }
    return next();
  };
}
