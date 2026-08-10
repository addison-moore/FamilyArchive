/**
 * Media storage drivers and helpers. Local filesystem by default;
 * S3-compatible optional. Originals are immutable.
 */

export { LocalStorageDriver } from "./local";
export { S3StorageDriver, type S3DriverOptions } from "./s3";
export {
  derivativeKey,
  exportKey,
  originalKey,
  treePrefix,
  uploadTempKey,
  UnsatisfiableRangeError,
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

/** The storage-related environment, structurally — avoids a dependency on @familyarchive/config. */
export interface StorageEnv {
  MEDIA_LOCAL_PATH?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE?: string;
}

const driverCache = new Map<"local" | "s3", StorageDriver>();

/**
 * Cached driver by name, built from the environment. The web app and the worker
 * both need this and each had its own byte-identical copy of the env-to-options
 * mapping — two places to update whenever a storage setting is added.
 */
export function storageDriverFromEnv(name: "local" | "s3", env: StorageEnv): StorageDriver {
  let cached = driverCache.get(name);
  if (!cached) {
    cached = createStorageDriver({
      driver: name,
      localPath: env.MEDIA_LOCAL_PATH,
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
      },
    });
    driverCache.set(name, cached);
  }
  return cached;
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
