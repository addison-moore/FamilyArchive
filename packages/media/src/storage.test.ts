import { describe, expect, it } from "vitest";

import {
  derivativeKey,
  exportKey,
  isMissingObject,
  mediaPrefix,
  originalKey,
  uploadTempKey,
} from "./storage";

describe("isMissingObject", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("recognises a missing file on either driver", () => {
    expect(isMissingObject(Object.assign(new Error("x"), { code: "ENOENT" }))).toBe(true);
    expect(isMissingObject(named("NoSuchKey"))).toBe(true);
    expect(isMissingObject(named("NotFound"))).toBe(true);
  });

  it("leaves real faults alone", () => {
    expect(isMissingObject(Object.assign(new Error("x"), { code: "EACCES" }))).toBe(false);
    expect(isMissingObject(named("AccessDenied"))).toBe(false);
    expect(isMissingObject("ENOENT")).toBe(false);
  });
});

describe("storage keys", () => {
  const treeId = "tree-1";
  const mediaId = "media-1";

  it("builds the immutable original key from hash and extension", () => {
    expect(originalKey(treeId, mediaId, "abc123", "jpg")).toBe(
      "trees/tree-1/media/media-1/original/abc123.jpg",
    );
  });

  it("keeps temp uploads and derivatives under the media prefix", () => {
    expect(uploadTempKey(treeId, mediaId)).toBe("trees/tree-1/media/media-1/tmp-upload");
    expect(derivativeKey(treeId, mediaId, "thumb-320.webp")).toBe(
      "trees/tree-1/media/media-1/derivatives/thumb-320.webp",
    );
  });

  it("holds every key the app writes for an item, so removing the prefix removes them all", () => {
    const prefix = mediaPrefix(treeId, mediaId);
    for (const key of [
      originalKey(treeId, mediaId, "abc123", "jpg"),
      derivativeKey(treeId, mediaId, "thumb_512.webp"),
      uploadTempKey(treeId, mediaId),
    ]) {
      expect(key.startsWith(prefix), key).toBe(true);
    }
  });

  it("ends the media prefix in a slash, so a longer id can't match it on S3", () => {
    const prefix = mediaPrefix(treeId, mediaId);
    expect(prefix).toBe("trees/tree-1/media/media-1/");
    expect(originalKey(treeId, "media-10", "abc123", "jpg").startsWith(prefix)).toBe(false);
  });

  it("refuses to build a media prefix from an empty id", () => {
    // `trees/tree-1/media//` resolves to the whole archive's media on the local driver.
    expect(() => mediaPrefix(treeId, "")).toThrow();
    expect(() => mediaPrefix("", mediaId)).toThrow();
  });

  it("keeps export bundles outside the media prefix", () => {
    const key = exportKey(treeId, "export-1");
    expect(key).toBe("trees/tree-1/exports/export-1.zip");
    expect(key).not.toContain("/media/");
  });
});
