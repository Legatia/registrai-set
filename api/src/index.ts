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
import { accountRoutes } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { organizationRoutes } from "./routes/organizations.js";
import { billingRoutes } from "./routes/billing.js";
import { registrationRoutes } from "./routes/registration.js";
import { processDeliveryQueue, pollReputationChanges } from "./webhooks/dispatcher.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();
const publicApp = new Hono<AppEnv>();
const adminApp = new Hono<AppEnv>();

function resolveAllowedOrigins(env: AppEnv["Bindings"]): string[] | "*" {
  const raw = env.CORS_ORIGINS?.trim();
  if (!raw) return "*";
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : "*";
}

app.use(
  "*",
  async (c, next) =>
    cors({
      origin: resolveAllowedOrigins(c.env),
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-API-Key", "X-Admin-Key"],
      maxAge: 86400,
    })(c, next)
);

// Public/developer middleware stack
publicApp.use("*", apiKeyAuth());
publicApp.use("*", dailyQuota());

// Global write-rate limit for all mutating public/developer operations
publicApp.use(
  "*",
  createRateLimiter({
    bucket: "global_write",
    limit: 120,
    windowSeconds: 60,
    methods: ["POST", "PATCH", "DELETE"],
  })
);

// Stricter limits for high-cost or abuse-prone endpoints
publicApp.use(
  "/agents/:id/feedback/build",
  createRateLimiter({
    bucket: "feedback_build",
    limit: 20,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
publicApp.use(
  "/agents/:id/feedback",
  createRateLimiter({
    bucket: "feedback_submit",
    limit: 10,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
publicApp.use(
  "/agents/link",
  createRateLimiter({
    bucket: "link_post",
    limit: 5,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
publicApp.use(
  "/agents/:id/presence",
  createRateLimiter({
    bucket: "presence_post",
    limit: 10,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
publicApp.use(
  "/agents/register/build",
  createRateLimiter({
    bucket: "register_build",
    limit: 20,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
publicApp.use(
  "/agents/register/confirm",
  createRateLimiter({
    bucket: "register_confirm",
    limit: 20,
    windowSeconds: 60,
    methods: ["POST"],
  })
);
publicApp.use(
  "/me/keys",
  createRateLimiter({
    bucket: "developer_keys_write",
    limit: 20,
    windowSeconds: 60,
    methods: ["POST", "DELETE"],
  })
);
publicApp.use(
  "/me/keys/*",
  createRateLimiter({
    bucket: "developer_keys_write",
    limit: 20,
    windowSeconds: 60,
    methods: ["POST", "DELETE"],
  })
);

// Public + developer-auth routes
publicApp.route("/", healthRoutes);
publicApp.route("/", statsRoutes);
publicApp.route("/", agentsRoutes);
publicApp.route("/", linkRoutes);
publicApp.route("/", feedbackRoutes);
publicApp.route("/", presenceRoutes);
publicApp.route("/", webhookRoutes);
publicApp.route("/", accountRoutes);
publicApp.route("/", registrationRoutes);

// Admin-only routes
adminApp.use("*", adminAuth());
adminApp.use(
  "*",
  createRateLimiter({
    bucket: "admin_all",
    limit: 120,
    windowSeconds: 60,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
adminApp.use(
  "/developers",
  createRateLimiter({
    bucket: "admin_developers",
    limit: 30,
    windowSeconds: 60,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
adminApp.use(
  "/developers/*",
  createRateLimiter({
    bucket: "admin_developers",
    limit: 30,
    windowSeconds: 60,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
adminApp.use(
  "/organizations",
  createRateLimiter({
    bucket: "admin_organizations",
    limit: 30,
    windowSeconds: 60,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
adminApp.use(
  "/organizations/*",
  createRateLimiter({
    bucket: "admin_organizations",
    limit: 30,
    windowSeconds: 60,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);
adminApp.route("/", developerRoutes);
adminApp.route("/", organizationRoutes);
adminApp.route("/", adminRoutes);
adminApp.route("/", billingRoutes);

app.route("/", publicApp);
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
