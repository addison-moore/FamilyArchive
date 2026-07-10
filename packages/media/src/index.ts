/**
 * Media storage drivers and helpers (PRD §24). Local filesystem by default;
 * S3-compatible optional. Originals are immutable (PRD §5.6).
 */

export { LocalStorageDriver } from "./local";
export { S3StorageDriver, type S3DriverOptions } from "./s3";
export {
  derivativeKey,
  exportKey,
  originalKey,
  uploadTempKey,
  type ByteRange,
  type PutOptions,
  type StorageDriver,
  type StorageObjectStream,
} from "./storage";

import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";
import type { StorageDriver } from "./storage";

export interface StorageOptions {
  driver: "local" | "s3";
  localPath?: string;
  s3?: {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
  };
}

export function createStorageDriver(options: StorageOptions): StorageDriver {
  if (options.driver === "s3") {
    const s3 = options.s3 ?? {};
    if (!s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
      throw new Error("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY");
    }
    return new S3StorageDriver({
      endpoint: s3.endpoint,
      region: s3.region,
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      forcePathStyle: s3.forcePathStyle,
    });
  }
  if (!options.localPath) {
    throw new Error("Local storage requires MEDIA_LOCAL_PATH");
  }
  return new LocalStorageDriver(options.localPath);
}
