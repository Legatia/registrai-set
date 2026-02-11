import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyAuth, adminAuth } from "./middleware/auth.js";
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

// Developer key auth for write endpoints
app.use("*", apiKeyAuth());

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
      ])
    );
  },
};
