import { getEnv } from "@familyarchive/config";
import { createStorageDriver, type StorageDriver } from "@familyarchive/media";

const cache = new Map<"local" | "s3", StorageDriver>();

/** Driver by name — mirrors the web app: write with the configured driver, read with the item's. */
export function storageDriverFor(name: "local" | "s3"): StorageDriver {
  let driver = cache.get(name);
  if (!driver) {
    const env = getEnv();
    driver = createStorageDriver({
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
    cache.set(name, driver);
  }
  return driver;
}
