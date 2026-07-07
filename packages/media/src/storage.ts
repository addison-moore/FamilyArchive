import type { Readable } from "node:stream";

/** Byte range for partial reads (video/audio seeking, PRD §25). */
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
 * Storage driver seam (PRD §24). Originals are immutable (§5.6): `delete` exists
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
}

/** Generated object keys (PRD §24.5). Never derived from user input. */
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
