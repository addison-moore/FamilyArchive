/**
 * Media storage drivers and helpers. Implementations (local filesystem, S3) land
 * in Milestone 6 (PRD §24); this interface is the seam they will fill.
 */
export interface StorageDriver {
  /** Store a file under a generated key and return the key. */
  put(key: string, data: ReadableStream | Uint8Array): Promise<void>;
  /** Retrieve a file as a stream. */
  get(key: string): Promise<ReadableStream>;
  /** Delete a stored file. Originals are immutable (PRD §5.6) — delete is for derivatives and soft-delete cleanup jobs only. */
  delete(key: string): Promise<void>;
}
