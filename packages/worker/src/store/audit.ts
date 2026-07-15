import type { AuditEntry } from "../types";
import { newAuditId } from "../ids";

export interface AuditInput {
  actorTokenId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function writeAudit(db: D1Database, input: AuditInput): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_log (id, actor_token_id, action, target_type, target_id, metadata, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      newAuditId(),
      input.actorTokenId,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ip ?? null,
      Date.now()
    )
    .run();
}

export async function listAudit(db: D1Database, limit = 100): Promise<AuditEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?")
    .bind(Math.min(Math.max(limit, 1), 1000))
    .all<AuditEntry>();
  return results;
}
