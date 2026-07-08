import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";

import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { getDb, mediaItems } from "@familyarchive/db";
import { originalKey, uploadTempKey } from "@familyarchive/media";
import { UPLOAD_MIME_TYPES } from "@familyarchive/shared";
import { and, eq, isNull, ne } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { enqueueMediaProcessing } from "@/lib/jobs";
import { getStorageDriver } from "@/lib/media";

/**
 * Media upload (PRD §15.5, §24.6, §31.5): raw request body streamed through a
 * SHA-256 transform into the storage driver at a temp key, then finalized to
 * the immutable §24.5 original key. Duplicate hashes within the tree are
 * rejected (§15.8). Contributor+ only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ treeId: string }> },
): Promise<Response> {
  const { treeId } = await params;
  let user;
  try {
    ({ user } = await requireMemberRole(treeId, "contributor"));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not authorized" }, { status: 403 });
    }
    throw error;
  }

  const env = getEnv();
  const maxBytes = env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024;

  const mimeType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const upload = UPLOAD_MIME_TYPES[mimeType];
  if (!upload) {
    return Response.json(
      { error: `Unsupported file type: ${mimeType || "unknown"}` },
      { status: 415 },
    );
  }

  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > maxBytes) {
    return Response.json(
      { error: `File exceeds the ${env.MEDIA_MAX_UPLOAD_MB} MB upload limit` },
      { status: 413 },
    );
  }
  const rawName = request.headers.get("x-file-name") ?? "upload";
  // Sanitized for storage as metadata only — never used in storage keys (§31.5).
  const originalFilename = decodeURIComponent(rawName)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f/\\]/g, "")
    .slice(0, 300);

  if (!request.body) {
    return Response.json({ error: "Empty request body" }, { status: 400 });
  }

  const db = getDb();
  const driver = getStorageDriver();

  // Row first: the media id anchors the storage key (§24.5).
  const inserted = await db
    .insert(mediaItems)
    .values({
      treeId,
      uploaderId: user.id,
      mediaType: upload.mediaType,
      originalFilename,
      mimeType,
      storageDriver: env.MEDIA_STORAGE_DRIVER,
      storageKey: "", // set on finalize
    })
    .returning({ id: mediaItems.id });
  const mediaId = inserted[0]?.id;
  if (!mediaId) return Response.json({ error: "Failed to create media item" }, { status: 500 });

  const tempKey = uploadTempKey(treeId, mediaId);
  const hasher = createHash("sha256");
  let byteCount = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      byteCount += chunk.length;
      if (byteCount > maxBytes) {
        callback(new Error("size-limit"));
        return;
      }
      hasher.update(chunk);
      callback(null, chunk);
    },
  });

  const cleanup = async () => {
    await driver.delete(tempKey).catch(() => {});
    await db.delete(mediaItems).where(eq(mediaItems.id, mediaId));
  };

  try {
    const body = Readable.fromWeb(request.body as import("stream/web").ReadableStream);
    body.pipe(tap);
    await driver.putStream(tempKey, tap);
  } catch (error) {
    await cleanup();
    if (error instanceof Error && error.message === "size-limit") {
      return Response.json(
        { error: `File exceeds the ${env.MEDIA_MAX_UPLOAD_MB} MB upload limit` },
        { status: 413 },
      );
    }
    throw error;
  }

  if (byteCount === 0) {
    await cleanup();
    return Response.json({ error: "Empty file" }, { status: 400 });
  }

  const hash = hasher.digest("hex");

  // Exact-duplicate detection (§15.8) among the tree's non-deleted media.
  const duplicate = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.treeId, treeId),
        eq(mediaItems.hash, hash),
        isNull(mediaItems.deletedAt),
        ne(mediaItems.id, mediaId),
      ),
    )
    .limit(1);
  if (duplicate[0]) {
    await cleanup();
    return Response.json(
      { error: "This file is already in the library", duplicateOf: duplicate[0].id },
      { status: 409 },
    );
  }

  const finalKey = originalKey(treeId, mediaId, hash, upload.extension);
  await driver.move(tempKey, finalKey);
  await db
    .update(mediaItems)
    .set({ hash, fileSize: byteCount, storageKey: finalKey, updatedAt: new Date() })
    .where(eq(mediaItems.id, mediaId));

  await enqueueMediaProcessing(treeId, mediaId);
  await recordAudit({
    treeId,
    actorId: user.id,
    action: "media.uploaded",
    targetType: "media",
    targetId: mediaId,
    summary: `Uploaded ${originalFilename}`,
  });

  return Response.json({ mediaId }, { status: 201 });
}
