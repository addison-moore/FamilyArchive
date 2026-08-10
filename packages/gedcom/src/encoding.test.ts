import { describe, expect, it } from "vitest";

import { declaredCharset, decodeGedcom, UnsupportedGedcomEncodingError } from "./encoding";

/** Build a GEDCOM header declaring `charset`, plus a body, in the given encoding. */
function file(charset: string | null, body: string, encoding: BufferEncoding = "utf8"): Uint8Array {
  const header = ["0 HEAD", "1 SOUR TEST", ...(charset ? [`1 CHAR ${charset}`] : [])].join("\n");
  return new Uint8Array(Buffer.from(`${header}\n${body}\n0 TRLR\n`, encoding));
}

describe("declaredCharset", () => {
  it("reads the header CHAR value", () => {
    expect(declaredCharset(file("ANSEL", "0 @I1@ INDI"))).toBe("ANSEL");
    expect(declaredCharset(file("utf-8", "0 @I1@ INDI"))).toBe("UTF-8");
  });

  it("returns null when the header omits it", () => {
    expect(declaredCharset(file(null, "0 @I1@ INDI"))).toBeNull();
  });

  it("does not mistake a CHAR line at another level for the header's", () => {
    expect(declaredCharset(file(null, "2 CHAR NOTTHIS"))).toBeNull();
  });
});

describe("decodeGedcom", () => {
  it("decodes a windows-1252 file declaring ANSI without corruption", () => {
    const bytes = file("ANSI", "1 NAME José /Álvarez/", "latin1");
    const { text, charset } = decodeGedcom(bytes);
    expect(charset).toBe("ANSI");
    expect(text).toContain("José /Álvarez/");
    expect(text).not.toContain("�");
  });

  it("decodes plain UTF-8", () => {
    const { text, charset } = decodeGedcom(file("UTF-8", "1 NAME 家族 /Tanaka/"));
    expect(charset).toBe("UTF-8");
    expect(text).toContain("家族 /Tanaka/");
  });

  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...file("UTF-8", "1 NAME A /B/")]);
    expect(decodeGedcom(bytes).text.startsWith("0 HEAD")).toBe(true);
  });

  it("rejects ANSEL instead of silently mangling it", () => {
    expect(() => decodeGedcom(file("ANSEL", "1 NAME Jose /Alvarez/"))).toThrow(
      UnsupportedGedcomEncodingError,
    );
  });

  it("rejects undeclared legacy bytes rather than importing replacement characters", () => {
    // High-bit bytes with no CHAR line: decoding as UTF-8 yields U+FFFD.
    const bytes = file(null, "1 NAME Jos\xe9 /Alvarez/", "latin1");
    expect(() => decodeGedcom(bytes)).toThrow(UnsupportedGedcomEncodingError);
  });

  it("keeps a plain ASCII file with no CHAR line working", () => {
    const { text, charset } = decodeGedcom(file(null, "1 NAME Jane /Doe/"));
    expect(charset).toBe("UTF-8");
    expect(text).toContain("Jane /Doe/");
  });
});
