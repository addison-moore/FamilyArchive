import type { Readable } from "node:stream";

/** Byte range for partial reads (video/audio seeking). */
export interface ByteRange {
  start: number;
  /** Inclusive; omitted = to end of file. */
  end?: number;
}

export interface StorageObjectStream {
  stream: Readable;
  /** Total object size in bytes. */
  totalSize: number;
  /** Set when a range was applied. */
  range?: { start: number; end: number };
}

/**
 * Storage driver seam. Originals are immutable: nothing overwrites or alters one.
 * `delete` and `deletePrefix` remove objects outright, and for an original that
 * happens only when an admin permanently removes an item from Trash or an archive
 * is deleted (PRD §5.6).
 */
export interface PutOptions {
  /** Allowed only for regenerable derivatives — originals are never overwritten. */
  overwrite?: boolean;
}

export interface StorageDriver {
  putStream(key: string, data: Readable, options?: PutOptions): Promise<void>;
  getStream(key: string, range?: ByteRange): Promise<StorageObjectStream>;
  move(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Delete every object under a key prefix: one media item's files when it is
   * permanently removed from Trash, or a whole archive's once its rows have cascaded
   * away. Missing objects are not an error, so a retry is safe. Any object it could
   * not remove is, because callers go on to report the space as freed.
   */
  deletePrefix(prefix: string): Promise<void>;
}

/** Everything stored for one archive. */
export function treePrefix(treeId: string): string {
  return `trees/${treeId}/`;
}

/**
 * Everything stored for one media item: its original, derivatives and any temp upload.
 *
 * The trailing slash matters on S3, where a prefix is a plain string match, so
 * `…/media/abc` would also take `…/media/abcd`. Empty ids are refused because on the
 * local driver `trees/t/media//` resolves to the whole archive's media.
 */
export function mediaPrefix(treeId: string, mediaId: string): string {
  if (!treeId || !mediaId) throw new Error("A media prefix needs an archive id and a media id");
  return `trees/${treeId}/media/${mediaId}/`;
}

/**
 * A range whose start lies at or past the end of the object. RFC 7233 calls for
 * a 416 with a `bytes * /total` Content-Range; drivers raise this so the route
 * layer can answer correctly instead of surfacing a generic 500.
 */
export class UnsatisfiableRangeError extends Error {
  constructor(
    readonly requestedStart: number,
    readonly totalSize: number,
  ) {
    super(`Range start ${requestedStart} is beyond the object size ${totalSize}`);
    this.name = "UnsatisfiableRangeError";
  }
}

/**
 * True when a read failed because the object is not in storage (a volume restored
 * without its media, a file removed by hand). The record outlives the bytes, so
 * routes answer 404 rather than reporting a server fault for every request.
 */
export function isMissingObject(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error as NodeJS.ErrnoException).code === "ENOENT" ||
    error.name === "NoSuchKey" ||
    error.name === "NotFound"
  );
}

/** Generated object keys. Never derived from user input. */
export function originalKey(
  treeId: string,
  mediaId: string,
  hash: string,
  extension: string,
): string {
  return `trees/${treeId}/media/${mediaId}/original/${hash}.${extension}`;
}

export function uploadTempKey(treeId: string, mediaId: string): string {
  return `trees/${treeId}/media/${mediaId}/tmp-upload`;
}

export function derivativeKey(treeId: string, mediaId: string, fileName: string): string {
  return `trees/${treeId}/media/${mediaId}/derivatives/${fileName}`;
}

/** Archive export bundles live outside media/ so they never mix with originals. */
export function exportKey(treeId: string, exportId: string): string {
  return `trees/${treeId}/exports/${exportId}.zip`;
}
