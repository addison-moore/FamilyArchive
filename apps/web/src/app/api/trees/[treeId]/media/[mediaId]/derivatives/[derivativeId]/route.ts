import { Readable } from "node:stream";

import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaDerivatives } from "@familyarchive/db";
import { and, eq } from "drizzle-orm";

import { getMediaItem, getStorageDriverFor } from "@/lib/media";

/** Serve a generated derivative (thumbnail, PDF page, video frame). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ treeId: string; mediaId: string; derivativeId: string }> },
): Promise<Response> {
  const { treeId, mediaId, derivativeId } = await params;
  try {
    await requireTreeRole(treeId, "viewer");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  // Media lookup enforces tree scope + soft delete; derivative must belong to it.
  const media = await getMediaItem(treeId, mediaId);
  if (!media) return Response.json({ error: "Not found" }, { status: 404 });

  const rows = await getDb()
    .select()
    .from(mediaDerivatives)
    .where(and(eq(mediaDerivatives.id, derivativeId), eq(mediaDerivatives.mediaId, mediaId)))
    .limit(1);
  const derivative = rows[0];
  if (!derivative) return Response.json({ error: "Not found" }, { status: 404 });

  const driver = getStorageDriverFor(derivative.storageDriver === "s3" ? "s3" : "local");
  const object = await driver.getStream(derivative.storageKey);
  return new Response(Readable.toWeb(object.stream) as ReadableStream, {
    headers: {
      "Content-Type": derivative.mimeType,
      "Content-Length": String(object.totalSize),
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
