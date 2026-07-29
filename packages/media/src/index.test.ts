import { describe, expect, it } from "vitest";

import { createStorageDriver } from "./index";
import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";

describe("createStorageDriver", () => {
  it("builds the local driver from a path", () => {
    const driver = createStorageDriver({ driver: "local", localPath: "/data/media" });
    expect(driver).toBeInstanceOf(LocalStorageDriver);
  });

  it("requires MEDIA_LOCAL_PATH for the local driver", () => {
    expect(() => createStorageDriver({ driver: "local" })).toThrow(/MEDIA_LOCAL_PATH/);
  });

  it("builds the S3 driver when fully configured", () => {
    const driver = createStorageDriver({
      driver: "s3",
      s3: {
        endpoint: "http://localhost:9000",
        bucket: "familyarchive",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    });
    expect(driver).toBeInstanceOf(S3StorageDriver);
  });

  it("names the missing S3 settings", () => {
    expect(() => createStorageDriver({ driver: "s3", s3: { bucket: "b" } })).toThrow(
      /S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY/,
    );
    expect(() => createStorageDriver({ driver: "s3" })).toThrow(/S3_BUCKET/);
  });
});
