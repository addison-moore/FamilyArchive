import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { S3StorageDriver } from "./s3";

const PREFIX = "trees/t1/media/m1/";

/** Answers the listing with one object and the delete with `deleted`; no network. */
function stubS3(deleted: { Errors?: { Key: string; Code: string }[] }) {
  return vi.spyOn(S3Client.prototype, "send").mockImplementation((async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      return { Contents: [{ Key: `${PREFIX}original/abc.png` }], IsTruncated: false };
    }
    if (command instanceof DeleteObjectsCommand) return deleted;
    throw new Error("unexpected S3 command");
  }) as never);
}

function driver(): S3StorageDriver {
  return new S3StorageDriver({
    bucket: "archive",
    region: "us-east-1",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("S3StorageDriver.deletePrefix", () => {
  it("resolves when every object was removed", async () => {
    const send = stubS3({});
    await expect(driver().deletePrefix(PREFIX)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("throws when S3 answers 200 but refused an object", async () => {
    // Callers report the space as freed, so a silent partial failure would leave
    // the files in the bucket with nothing left pointing at them.
    stubS3({ Errors: [{ Key: `${PREFIX}original/abc.png`, Code: "AccessDenied" }] });
    await expect(driver().deletePrefix(PREFIX)).rejects.toThrow(
      /refused to delete 1 .*AccessDenied/,
    );
  });

  it("refuses an empty prefix", async () => {
    const send = stubS3({});
    await expect(driver().deletePrefix("")).rejects.toThrow(/empty storage prefix/);
    expect(send).not.toHaveBeenCalled();
  });
});
