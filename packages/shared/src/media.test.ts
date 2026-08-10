import { describe, expect, it } from "vitest";

import { isBrowserRenderableImage, isImageMime, isMediaType, UPLOAD_MIME_TYPES } from "./media";

describe("UPLOAD_MIME_TYPES (allowlist)", () => {
  it("maps every allowlisted MIME to a valid media type and clean extension", () => {
    for (const [mime, entry] of Object.entries(UPLOAD_MIME_TYPES)) {
      expect(isMediaType(entry.mediaType), mime).toBe(true);
      expect(entry.extension, mime).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("maps the platform-specific spellings to their canonical extensions", () => {
    expect(UPLOAD_MIME_TYPES["video/quicktime"]).toEqual({ mediaType: "video", extension: "mov" });
    expect(UPLOAD_MIME_TYPES["audio/x-m4a"]).toEqual({ mediaType: "audio", extension: "m4a" });
    expect(UPLOAD_MIME_TYPES["image/tiff"]).toEqual({ mediaType: "photo", extension: "tif" });
    expect(UPLOAD_MIME_TYPES["application/pdf"]).toEqual({ mediaType: "pdf", extension: "pdf" });
  });

  it("has no entry for unlisted types", () => {
    expect(UPLOAD_MIME_TYPES["image/svg+xml"]).toBeUndefined();
    expect(UPLOAD_MIME_TYPES["application/zip"]).toBeUndefined();
  });
});

describe("isImageMime", () => {
  it("is true only for image/* MIME types", () => {
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/heic")).toBe(true);
    expect(isImageMime("video/mp4")).toBe(false);
    expect(isImageMime("application/pdf")).toBe(false);
  });
});

describe("isBrowserRenderableImage", () => {
  it("excludes the accepted image formats browsers cannot decode", () => {
    // Both are on the upload allowlist, and neither renders in Chrome/Firefox/Edge.
    expect(isBrowserRenderableImage("image/heic")).toBe(false);
    expect(isBrowserRenderableImage("image/tiff")).toBe(false);
    expect(isBrowserRenderableImage("IMAGE/HEIC")).toBe(false);
  });

  it("accepts the formats browsers do render, and nothing outside image/*", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(isBrowserRenderableImage(mime), mime).toBe(true);
    }
    expect(isBrowserRenderableImage("video/mp4")).toBe(false);
    expect(isBrowserRenderableImage("application/pdf")).toBe(false);
  });
});

describe("isMediaType", () => {
  it("rejects values outside the vocabulary", () => {
    expect(isMediaType("photo")).toBe(true);
    expect(isMediaType("gif")).toBe(false);
    expect(isMediaType(null)).toBe(false);
  });
});
