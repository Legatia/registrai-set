import type { Context, Next } from "hono";
import type { AppEnv } from "../env.js";

interface ApiKeyRow {
  key: string;
  developer_id: string;
  scopes: string;
  revoked_at: number | null;
}

/**
 * Auth middleware: validates developer API keys for write endpoints.
 * GET/OPTIONS pass through. Write requests require a valid, non-revoked key
 * from the api_keys table OR the legacy API_KEY env var.
 */
export function apiKeyAuth() {
  return async (c: Context<AppEnv>, next: Next) => {
    if (c.req.method === "GET" || c.req.method === "OPTIONS") {
      return next();
    }

    const headerKey = c.req.header("X-API-Key");
    if (!headerKey) {
      return c.json({ error: "Unauthorized — missing or invalid API key" }, 401);
    }

    // Legacy env var fallback
    const legacyApiKey = c.env.API_KEY;
    if (legacyApiKey && headerKey === legacyApiKey) {
      c.set("apiKey", headerKey);
      c.set("developerId", "__legacy__");
      await next();
      // Fire-and-forget usage logging
      try {
        await c.env.DB.prepare(
          "INSERT INTO api_usage (api_key, method, path, status_code) VALUES (?, ?, ?, ?)"
        ).bind(headerKey, c.req.method, c.req.path, c.res.status).run();
      } catch { /* non-critical */ }
      return;
    }

    // Look up in api_keys table
    const row = await c.env.DB.prepare(
      "SELECT key, developer_id, scopes, revoked_at FROM api_keys WHERE key = ?"
    ).bind(headerKey).first<ApiKeyRow>();

    if (!row || row.revoked_at !== null) {
      return c.json({ error: "Unauthorized — missing or invalid API key" }, 401);
    }

    c.set("apiKey", row.key);
    c.set("developerId", row.developer_id);

    await next();

    // Fire-and-forget usage logging
    try {
      await c.env.DB.prepare(
        "INSERT INTO api_usage (api_key, method, path, status_code) VALUES (?, ?, ?, ?)"
      ).bind(row.key, c.req.method, c.req.path, c.res.status).run();
    } catch { /* non-critical */ }
  };
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
