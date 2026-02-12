import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyAuth, adminAuth } from "./middleware/auth.js";
import { dailyQuota } from "./middleware/daily-quota.js";
import { cleanupRateLimits, createRateLimiter } from "./middleware/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { statsRoutes } from "./routes/stats.js";
import { agentsRoutes } from "./routes/agents.js";
import { linkRoutes } from "./routes/link.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { developerRoutes } from "./routes/developers.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { presenceRoutes } from "./routes/presence.js";
import { processDeliveryQueue, pollReputationChanges } from "./webhooks/dispatcher.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-API-Key", "X-Admin-Key"],
    maxAge: 86400,
  })
);

// Developer key auth for write endpoints (skip admin-only /developers paths)
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/developers")) return next();
  return apiKeyAuth()(c, next);
});
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/developers")) return next();
  return dailyQuota()(c, next);
});

// Global write-rate limit for all mutating operations (skip admin paths)
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/developers")) return next();
  return createRateLimiter({
    bucket: "global_write",
    limit: 120,
    windowSeconds: 60,
    methods: ["POST", "PATCH", "DELETE"],
  })(c, next);
});

// Stricter limits for high-cost or abuse-prone endpoints
app.use(
  "/agents/:id/feedback/build",
  createRateLimiter({
    bucket: "feedback_build",
    limit: 20,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
app.use(
  "/agents/:id/feedback",
  createRateLimiter({
    bucket: "feedback_submit",
    limit: 10,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
app.use(
  "/agents/link",
  createRateLimiter({
    bucket: "link_post",
    limit: 5,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
app.use(
  "/agents/:id/presence",
  createRateLimiter({
    bucket: "presence_post",
    limit: 10,
    windowSeconds: 60,
    methods: ["POST"],
  })
);

// Public + auth-protected routes
app.route("/", healthRoutes);
app.route("/", statsRoutes);
app.route("/", agentsRoutes);
app.route("/", linkRoutes);
app.route("/", feedbackRoutes);
app.route("/", presenceRoutes);
app.route("/", webhookRoutes);

// Admin-protected developer management routes
const adminApp = new Hono<AppEnv>();
adminApp.use("*", adminAuth());
adminApp.route("/", developerRoutes);
app.route("/", adminApp);

// Cloudflare Workers export
export default {
  fetch: app.fetch,

  // Cron Trigger handler — runs every minute
  async scheduled(event: ScheduledEvent, env: AppEnv["Bindings"], ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.all([
        processDeliveryQueue(env.DB),
        pollReputationChanges(env.DB),
        cleanupRateLimits(env.DB),
      ])
    );
  },
};
