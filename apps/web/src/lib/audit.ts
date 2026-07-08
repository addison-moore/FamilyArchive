import { auditLogs, getDb } from "@familyarchive/db";

/**
 * Audit trail writer (PRD §22, §31.6). Fire-and-forget from the caller's
 * perspective — an audit failure must never break the user action, so errors
 * are swallowed after logging to stderr.
 */
export async function recordAudit(entry: {
  treeId: string;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getDb()
      .insert(auditLogs)
      .values({
        treeId: entry.treeId,
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        summary: entry.summary,
        metadata: entry.metadata ?? {},
      });
  } catch (error) {
    console.error("audit write failed:", error);
  }
}
