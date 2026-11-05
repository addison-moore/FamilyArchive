import { Readable } from "node:stream";

import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";
import { isMissingObject } from "@familyarchive/media";

import { getStorageDriverFor } from "@/lib/media";
import { trashedThumbnail } from "@/lib/trash";

/**
 * A trashed item's thumbnail, so the Trash page can show what it lists. Separate from
 * the media routes so their rule stays simple: through them, a deleted item is
 * unreachable for everyone. This one is for editors and up, never public visitors.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ treeId: string; mediaId: string }> },
): Promise<Response> {
  const { treeId, mediaId } = await params;
  try {
    await requireMemberRole(treeId, "editor");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  const thumb = await trashedThumbnail(treeId, mediaId);
  if (!thumb) return Response.json({ error: "Not found" }, { status: 404 });

  const driver = getStorageDriverFor(thumb.storageDriver === "s3" ? "s3" : "local");
  let object;
  try {
    object = await driver.getStream(thumb.storageKey);
  } catch (error) {
    if (isMissingObject(error)) return Response.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
  return new Response(Readable.toWeb(object.stream) as ReadableStream, {
    headers: {
      "Content-Type": thumb.mimeType,
      "Content-Length": String(object.totalSize),
      // Not kept: a browser shouldn't hold on to something that may be removed for good.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
