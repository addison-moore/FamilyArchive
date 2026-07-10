import { getEnv } from "@familyarchive/config";
import { archiveExports, getDb } from "@familyarchive/db";
import { exportKey } from "@familyarchive/media";
import type { ExportStatus } from "@familyarchive/shared";
import { desc, eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { enqueueArchiveExport } from "@/lib/jobs";

export type ArchiveExportRow = typeof archiveExports.$inferSelect;

/** Most recent export row for an archive (the app keeps at most one live bundle). */
export async function latestExport(treeId: string): Promise<ArchiveExportRow | null> {
  const rows = await getDb()
    .select()
    .from(archiveExports)
    .where(eq(archiveExports.treeId, treeId))
    .orderBy(desc(archiveExports.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create an export row and enqueue the assembly job (admin+, enforced by
 * callers). Returns the row id, or null if an export is already in flight.
 */
export async function requestArchiveExport(
  treeId: string,
  userId: string,
  includeDeleted: boolean,
): Promise<string | null> {
  const current = await latestExport(treeId);
  const status = current?.status as ExportStatus | undefined;
  if (status === "pending" || status === "running") return null;

  const id = crypto.randomUUID();
  await getDb()
    .insert(archiveExports)
    .values({
      id,
      treeId,
      requestedBy: userId,
      includeDeleted,
      storageDriver: getEnv().MEDIA_STORAGE_DRIVER,
      storageKey: exportKey(treeId, id),
    });
  await enqueueArchiveExport({ treeId, exportId: id });
  await recordAudit({
    treeId,
    actorId: userId,
    action: "archive.export_requested",
    targetType: "tree",
    targetId: treeId,
    summary: includeDeleted
      ? "Archive export requested (including deleted items)"
      : "Archive export requested",
  });
  return id;
}
