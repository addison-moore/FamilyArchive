import { getEnv } from "@familyarchive/config";
import { storageDriverFromEnv, type StorageDriver } from "@familyarchive/media";

/** Driver by name — mirrors the web app: write with the configured driver, read with the item's. */
export function storageDriverFor(name: "local" | "s3"): StorageDriver {
  return storageDriverFromEnv(name, getEnv());
}
