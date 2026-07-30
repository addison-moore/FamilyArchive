import { describe, expect, it } from "vitest";

import { isFaceDetectionEligible } from "./faces";

describe("isFaceDetectionEligible", () => {
  it("requires both the photo media type and an image MIME", () => {
    expect(isFaceDetectionEligible("photo", "image/jpeg")).toBe(true);
    expect(isFaceDetectionEligible("photo", "application/pdf")).toBe(false);
    expect(isFaceDetectionEligible("document", "image/tiff")).toBe(false);
    expect(isFaceDetectionEligible("video", "video/mp4")).toBe(false);
  });
});
