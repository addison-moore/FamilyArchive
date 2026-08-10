import { Readable } from "node:stream";

import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { UnsatisfiableRangeError } from "@familyarchive/media";

import { contentDisposition } from "@/lib/http";
import { getMediaItem, getStorageDriverFor } from "@/lib/media";

/**
 * Serve an original file (authorized route, generated keys, no
 * public web root). Single-range requests are honored so video/audio can
 * seek.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ treeId: string; mediaId: string }> },
): Promise<Response> {
  const { treeId, mediaId } = await params;
  try {
    await requireTreeRole(treeId, "viewer");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  const media = await getMediaItem(treeId, mediaId);
  if (!media || !media.storageKey || !media.hash) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  const rangeMatch = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
  const range = rangeMatch
    ? { start: Number(rangeMatch[1]), end: rangeMatch[2] ? Number(rangeMatch[2]) : undefined }
    : undefined;

  const driver = getStorageDriverFor(media.storageDriver === "s3" ? "s3" : "local");
  let object;
  try {
    object = await driver.getStream(media.storageKey, range);
  } catch (error) {
    // A range starting past the end is a client error, not a server fault.
    if (error instanceof UnsatisfiableRangeError) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${error.totalSize}`, "Accept-Ranges": "bytes" },
      });
    }
    throw error;
  }
  const headers: Record<string, string> = {
    "Content-Type": media.mimeType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition("inline", media.originalFilename),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };

  const body = Readable.toWeb(object.stream) as ReadableStream;
  if (object.range) {
    headers["Content-Range"] =
      `bytes ${object.range.start}-${object.range.end}/${object.totalSize}`;
    headers["Content-Length"] = String(object.range.end - object.range.start + 1);
    return new Response(body, { status: 206, headers });
  }
  headers["Content-Length"] = String(object.totalSize);
  return new Response(body, { status: 200, headers });
}
