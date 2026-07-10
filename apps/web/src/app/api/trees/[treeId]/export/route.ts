import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";

import { latestExport, requestArchiveExport } from "@/lib/export";

/**
 * Archive export (PRD §5.5, §3 amendment 2026-07-09). Admin+ only — the bundle
 * contains every member's contributions and all original files. REST (not a
 * server action) so external tooling can drive exports too.
 */
export async function POST(
  request: Request,
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
      return Response.json({ error: "Not authorized" }, { status: 403 });
    }
    throw error;
  }

  const body = (await request.json().catch(() => ({}))) as { includeDeleted?: boolean };
  const exportId = await requestArchiveExport(treeId, userId, body.includeDeleted === true);
  if (!exportId) {
    return Response.json({ error: "An export is already in progress" }, { status: 409 });
  }
  return Response.json({ exportId }, { status: 201 });
}

/** Latest export status for the archive. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ treeId: string }> },
): Promise<Response> {
  const { treeId } = await params;
  try {
    await requireMemberRole(treeId, "admin");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  const row = await latestExport(treeId);
  if (!row) return Response.json({ export: null });
  return Response.json({
    export: {
      id: row.id,
      status: row.status,
      includeDeleted: row.includeDeleted,
      fileSize: row.fileSize,
      counts: row.counts,
      error: row.error,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    },
  });
}
