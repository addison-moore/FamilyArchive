import { describe, expect, it } from "vitest";

import { UPLOAD_MIME_TYPES } from "./media";
import { matchesUploadSignature, UPLOAD_SIGNATURE_BYTES } from "./media-signature";

const text = (value: string) => new TextEncoder().encode(value);
/** An ISO base media file: a four-byte size, then the atom name. */
const atom = (name: string) => new Uint8Array([0, 0, 0, 24, ...text(name)]);
const riff = (form: string) => new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text(form)]);

const SAMPLES: Record<string, Uint8Array> = {
  "image/jpeg": new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  "image/png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": riff("WEBP"),
  "image/gif": text("GIF89a"),
  "image/heic": atom("ftyp"),
  "image/tiff": new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]),
  "video/mp4": atom("ftyp"),
  "video/webm": new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
  "video/quicktime": atom("moov"),
  "audio/mpeg": new Uint8Array([0xff, 0xfb, 0x90, 0x00]),
  "audio/mp4": atom("ftyp"),
  "audio/x-m4a": atom("ftyp"),
  "audio/wav": riff("WAVE"),
  "audio/x-wav": riff("WAVE"),
  "audio/ogg": text("OggS"),
  "application/pdf": text("%PDF-1.7"),
};

describe("matchesUploadSignature", () => {
  it("has a real sample for every allowlisted type", () => {
    // A new allowlist entry without a signature would refuse every upload of it.
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(UPLOAD_MIME_TYPES).sort());
    for (const [mime, sample] of Object.entries(SAMPLES)) {
      expect(matchesUploadSignature(mime, sample), mime).toBe(true);
    }
  });

  it("refuses an HLS playlist labelled as video", () => {
    // The attack this exists for: ffmpeg would follow what the playlist references.
    const playlist = text("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nfile:///etc/passwd\n");
    expect(matchesUploadSignature("video/mp4", playlist)).toBe(false);
    expect(matchesUploadSignature("video/quicktime", playlist)).toBe(false);
    expect(matchesUploadSignature("video/webm", playlist)).toBe(false);
  });

  it("refuses markup labelled as an image", () => {
    const html = text("<!doctype html><script>alert(1)</script>");
    for (const mime of ["image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff"]) {
      expect(matchesUploadSignature(mime, html), mime).toBe(false);
    }
  });

  it("keeps RIFF forms apart", () => {
    expect(matchesUploadSignature("image/webp", riff("WAVE"))).toBe(false);
    expect(matchesUploadSignature("audio/wav", riff("WEBP"))).toBe(false);
  });

  it("accepts an MP3 with an ID3 tag", () => {
    expect(matchesUploadSignature("audio/mpeg", text("ID3\u0004"))).toBe(true);
  });

  it("finds a PDF header after leading junk, within the window it reads", () => {
    const padded = (length: number) =>
      new Uint8Array([...new Uint8Array(length).fill(0x20), ...text("%PDF-1.4")]);
    expect(matchesUploadSignature("application/pdf", padded(512))).toBe(true);
    const beyond = padded(UPLOAD_SIGNATURE_BYTES).subarray(0, UPLOAD_SIGNATURE_BYTES);
    expect(matchesUploadSignature("application/pdf", beyond)).toBe(false);
  });

  it("refuses a file too short to carry any signature", () => {
    expect(matchesUploadSignature("image/png", new Uint8Array([0x89]))).toBe(false);
    expect(matchesUploadSignature("video/mp4", new Uint8Array())).toBe(false);
  });

  it("refuses a type that is not on the allowlist", () => {
    expect(matchesUploadSignature("image/svg+xml", text("<svg"))).toBe(false);
  });
});
