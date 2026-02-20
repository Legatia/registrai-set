type ActorType = "admin" | "developer" | "system";

interface AuditInput {
  actorType: ActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(db: D1Database, input: AuditInput): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.actorType,
        input.actorId,
        input.action,
        input.targetType,
        input.targetId,
        JSON.stringify(input.metadata ?? {})
      )
      .run();
  } catch {
    // non-critical logging path
  }
}
