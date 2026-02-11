import { hmacSign } from "../db.js";

interface WebhookRow {
  id: string;
  developer_id: string;
  url: string;
  secret: string;
  events: string;
  agent_id: string | null;
  active: number;
}

interface DeliveryRow {
  id: number;
  webhook_id: string;
  event: string;
  payload: string;
  attempts: number;
}

interface ReputationSnapshot {
  master_agent_id: string;
  unified_value: string;
  unified_value_decimals: number;
  total_feedback_count: string;
}

// Backoff schedule: 10s, 30s, 90s, 270s, 810s
const BACKOFF_SECONDS = [10, 30, 90, 270, 810];
const MAX_ATTEMPTS = 5;

// In-memory cache for reputation polling.
// Persists within a Worker instance lifetime; reset on cold start is fine.
const lastKnownReputation = new Map<string, string>();

/**
 * Enqueue a webhook event: finds matching webhooks and creates delivery rows.
 */
export async function enqueueEvent(
  db: D1Database,
  event: string,
  agentId: string,
  payload: object
): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const payloadStr = JSON.stringify(payload);

    // Find all active webhooks that subscribe to this event
    const webhooks = (
      await db
        .prepare(
          "SELECT * FROM webhooks WHERE active = 1 AND (',' || events || ',') LIKE ?"
        )
        .bind(`%,${event},%`)
        .all<WebhookRow>()
    ).results;

    const stmts: D1PreparedStatement[] = [];

    for (const wh of webhooks) {
      // Filter by agent_id if the webhook has one
      if (wh.agent_id && wh.agent_id !== agentId) continue;
      stmts.push(
        db
          .prepare(
            "INSERT INTO webhook_deliveries (webhook_id, event, payload, created_at) VALUES (?, ?, ?, ?)"
          )
          .bind(wh.id, event, payloadStr, now)
      );
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
    }
  } catch (err) {
    console.error("[webhook] Failed to enqueue event:", event, err);
  }
}

/**
 * Process the delivery queue: send pending deliveries and handle retries.
 * Called from the scheduled handler in index.ts.
 */
export async function processDeliveryQueue(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Select pending deliveries: either new (attempts=0, no status) or due for retry
  const pending = (
    await db
      .prepare(
        `SELECT d.id, d.webhook_id, d.event, d.payload, d.attempts
         FROM webhook_deliveries d
         WHERE d.status_code IS NULL
           AND (d.attempts = 0 OR (d.next_retry_at IS NOT NULL AND d.next_retry_at <= ?))
         ORDER BY d.created_at ASC
         LIMIT 50`
      )
      .bind(now)
      .all<DeliveryRow>()
  ).results;

  for (const delivery of pending) {
    const webhook = await db
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .bind(delivery.webhook_id)
      .first<WebhookRow>();

    if (!webhook || webhook.active === 0) {
      // Webhook deleted or deactivated -- mark delivery as failed
      await db
        .prepare(
          "UPDATE webhook_deliveries SET status_code = -1 WHERE id = ?"
        )
        .bind(delivery.id)
        .run();
      continue;
    }

    const body = JSON.stringify({
      event: delivery.event,
      webhookId: webhook.id,
      payload: JSON.parse(delivery.payload),
      timestamp: now,
    });

    // Compute HMAC-SHA256 signature using Web Crypto
    const signature = await hmacSign(webhook.secret, body);

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KYA-Signature": signature,
          "X-KYA-Event": delivery.event,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        await db
          .prepare(
            "UPDATE webhook_deliveries SET status_code = ?, delivered_at = ?, attempts = ? WHERE id = ?"
          )
          .bind(res.status, now, delivery.attempts + 1, delivery.id)
          .run();
      } else {
        await handleFailure(db, delivery, res.status);
      }
    } catch {
      await handleFailure(db, delivery, null);
    }
  }
}

async function handleFailure(
  db: D1Database,
  delivery: DeliveryRow,
  statusCode: number | null
): Promise<void> {
  const newAttempts = delivery.attempts + 1;
  const now = Math.floor(Date.now() / 1000);

  if (newAttempts >= MAX_ATTEMPTS) {
    // Permanently failed
    await db
      .prepare(
        "UPDATE webhook_deliveries SET status_code = -1, attempts = ? WHERE id = ?"
      )
      .bind(newAttempts, delivery.id)
      .run();
  } else {
    // Schedule retry with exponential backoff
    const backoff = BACKOFF_SECONDS[newAttempts - 1] || 810;
    const nextRetry = now + backoff;
    await db
      .prepare(
        "UPDATE webhook_deliveries SET attempts = ?, next_retry_at = ? WHERE id = ?"
      )
      .bind(newAttempts, nextRetry, delivery.id)
      .run();
  }
}

/**
 * Poll for reputation changes and fire events.
 * Compares current agents.unified_value against last known values.
 * Called from the scheduled handler in index.ts.
 */
export async function pollReputationChanges(db: D1Database): Promise<void> {
  try {
    // Check if any webhooks care about reputation events
    const reputationWebhooks = await db
      .prepare(
        "SELECT COUNT(*) as cnt FROM webhooks WHERE active = 1 AND (events LIKE '%reputation.changed%' OR events LIKE '%reputation.threshold%')"
      )
      .first<{ cnt: number }>();

    if (!reputationWebhooks || reputationWebhooks.cnt === 0) return;

    const agents = (
      await db
        .prepare(
          "SELECT master_agent_id, unified_value, unified_value_decimals, total_feedback_count FROM agents"
        )
        .all<ReputationSnapshot>()
    ).results;

    for (const agent of agents) {
      const key = agent.master_agent_id;
      const current = `${agent.unified_value}:${agent.unified_value_decimals}:${agent.total_feedback_count}`;
      const previous = lastKnownReputation.get(key);

      if (previous === undefined) {
        // First time seeing this agent -- initialize without firing
        lastKnownReputation.set(key, current);
        continue;
      }

      if (previous !== current) {
        lastKnownReputation.set(key, current);

        const rawValue = Number(agent.unified_value);
        const decimals = agent.unified_value_decimals;
        const score = decimals > 0 ? rawValue / 10 ** decimals : rawValue;

        await enqueueEvent(db, "reputation.changed", key, {
          agentId: key,
          unifiedValue: agent.unified_value,
          unifiedValueDecimals: agent.unified_value_decimals,
          totalFeedbackCount: agent.total_feedback_count,
          score,
        });

        // Check threshold crossings (fire if score dropped below common thresholds)
        const thresholds = [100, 50, 25, 0];
        const [prevVal, prevDec] = previous.split(":");
        const prevScore =
          Number(prevDec) > 0
            ? Number(prevVal) / 10 ** Number(prevDec)
            : Number(prevVal);

        for (const threshold of thresholds) {
          if (prevScore >= threshold && score < threshold) {
            await enqueueEvent(db, "reputation.threshold", key, {
              agentId: key,
              threshold,
              previousScore: prevScore,
              currentScore: score,
            });
            break; // Only fire for the first threshold crossed
          }
        }
      }
    }
  } catch (err) {
    console.error("[webhook] Reputation poll error:", err);
  }
}
