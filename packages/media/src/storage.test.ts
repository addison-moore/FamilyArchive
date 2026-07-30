import { describe, expect, it } from "vitest";

import { derivativeKey, exportKey, originalKey, uploadTempKey } from "./storage";

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

  it("keeps export bundles outside the media prefix", () => {
    const key = exportKey(treeId, "export-1");
    expect(key).toBe("trees/tree-1/exports/export-1.zip");
    expect(key).not.toContain("/media/");
  });
});
