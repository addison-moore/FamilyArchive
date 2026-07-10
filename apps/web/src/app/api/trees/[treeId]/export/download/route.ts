import { Readable } from "node:stream";

import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";
import { getDb, trees } from "@familyarchive/db";
import { eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { latestExport } from "@/lib/export";
import { getStorageDriverFor } from "@/lib/media";

/** Download the completed archive bundle (admin+, audit-logged, expires with the bundle). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ treeId: string }> },
): Promise<Response> {
  const { treeId } = await params;
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireMemberRole(treeId, "admin"));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  const row = await latestExport(treeId);
  if (!row || row.status !== "complete") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "This export has expired — request a new one" }, { status: 410 });
  }

  const [tree] = await getDb().select().from(trees).where(eq(trees.id, treeId));
  const baseName = (tree?.name ?? "archive").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  const driver = getStorageDriverFor(row.storageDriver === "s3" ? "s3" : "local");
  const object = await driver.getStream(row.storageKey);

  await recordAudit({
    treeId,
    actorId: userId,
    action: "archive.export_downloaded",
    targetType: "tree",
    targetId: treeId,
    summary: "Archive export bundle downloaded",
  });

  return new Response(Readable.toWeb(object.stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(object.totalSize),
      "Content-Disposition": `attachment; filename="${baseName || "archive"}-export.zip"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
