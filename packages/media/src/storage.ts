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
 * Storage driver seam. Originals are immutable: `delete` exists
 * for temp-upload cleanup and future derivative management, never for mutating
 * a stored original in place.
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
   * Delete every object under a key prefix. Needed when an archive is deleted:
   * the DB rows holding the storage keys cascade away, so without a prefix
   * sweep the bytes are unreachable and would sit on disk forever.
   */
  deletePrefix(prefix: string): Promise<void>;
}

/** Everything stored for one archive. */
export function treePrefix(treeId: string): string {
  return `trees/${treeId}/`;
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
