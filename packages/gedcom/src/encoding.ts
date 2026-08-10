/**
 * GEDCOM character-set handling.
 *
 * GEDCOM 5.5.1 declares its encoding in the header (`1 CHAR <value>`) and files
 * exported by PAF, Legacy and older Family Tree Maker are routinely ANSEL or
 * ANSI rather than UTF-8. Decoding those bytes as UTF-8 does not fail loudly —
 * every high byte becomes U+FFFD — so accented names, places and notes were
 * silently written to the database already corrupted, and the raw GEDCOM kept
 * for provenance preserved the damage rather than the original text.
 */

/** Raised when a file declares an encoding we cannot decode faithfully. */
export class UnsupportedGedcomEncodingError extends Error {
  constructor(readonly charset: string) {
    super(
      `This file declares "${charset}" encoding, which FamilyArchive cannot read. ` +
        `Re-export it from your genealogy software as UTF-8 and try again.`,
    );
    this.name = "UnsupportedGedcomEncodingError";
  }
}

/** The declared `1 CHAR` value, uppercased, or null when the header omits it. */
export function declaredCharset(bytes: Uint8Array): string | null {
  // The header is ASCII regardless of the body's encoding, so latin1 over the
  // first few KB is always safe to scan.
  const head = Buffer.from(bytes.subarray(0, 4096)).toString("latin1");
  const match = head.match(/^1 CHAR (.+)$/m);
  return match?.[1]?.trim().toUpperCase() ?? null;
}

/**
 * Map a declared GEDCOM charset onto a TextDecoder label.
 * Returns null for charsets no decoder can handle (ANSEL).
 */
function decoderLabelFor(charset: string | null): string | null {
  switch (charset) {
    case null:
    case "UTF-8":
    case "UTF8":
    case "UNICODE": // 5.5.1 uses UNICODE for UTF-16, handled by the BOM check
    case "ASCII":
      return "utf-8";
    case "ANSI":
    case "WINDOWS-1252":
    case "CP1252":
    case "IBMWINDOWS":
      return "windows-1252";
    case "MACINTOSH":
      return "macintosh";
    case "ANSEL":
      return null;
    default:
      return "utf-8";
  }
}

export interface DecodedGedcom {
  text: string;
  /** The charset actually used, for provenance. */
  charset: string;
}

/**
 * Decode GEDCOM bytes using the encoding the file declares, honouring a BOM
 * when present. Throws UnsupportedGedcomEncodingError rather than returning
 * mojibake, so a bad import fails visibly instead of poisoning the archive.
 */
export function decodeGedcom(bytes: Uint8Array): DecodedGedcom {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), charset: "UTF-8" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), charset: "UTF-16LE" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), charset: "UTF-16BE" };
  }

  const charset = declaredCharset(bytes);
  const label = decoderLabelFor(charset);
  if (label === null) throw new UnsupportedGedcomEncodingError(charset ?? "unknown");

  const text = new TextDecoder(label).decode(bytes);
  // An undeclared legacy encoding still lands here as UTF-8. Replacement
  // characters are the tell, and are worth failing on: the alternative is
  // storing corrupted names that cannot be recovered from inside the app.
  if (label === "utf-8" && text.includes("�")) {
    throw new UnsupportedGedcomEncodingError(charset ?? "non-UTF-8");
  }
  return { text, charset: charset ?? "UTF-8" };
}
