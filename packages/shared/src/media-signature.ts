/**
 * Checks an upload's leading bytes against the type its client declared.
 *
 * The declared Content-Type alone proves nothing, and it decides which tool the
 * worker hands the bytes to: ffmpeg in particular probes its input, so a
 * playlist labelled video/mp4 used to reach demuxers that follow references to
 * other files and URLs. This only has to recognise the allowlist, and it stays
 * lenient where real files vary, because refusing a family's genuine scan is
 * worse than letting an oddly-formed one through to fail in processing.
 */

/** Enough to see every signature below, including a PDF header after leading junk. */
export const UPLOAD_SIGNATURE_BYTES = 1024;

const ascii = (head: Uint8Array, offset: number, text: string): boolean => {
  if (head.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (head[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

const bytes = (head: Uint8Array, offset: number, expected: number[]): boolean =>
  head.length >= offset + expected.length && expected.every((b, i) => head[offset + i] === b);

/**
 * ISO base media files (MP4, MOV, M4A, HEIC) open with a size then an atom name.
 * `ftyp` is the norm, but older QuickTime files start straight on a data atom.
 */
const ISO_BMFF_ATOMS = ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot", "styp", "moof"];
const isIsoBmff = (head: Uint8Array) => ISO_BMFF_ATOMS.some((atom) => ascii(head, 4, atom));

const isRiff = (head: Uint8Array, form: string) => ascii(head, 0, "RIFF") && ascii(head, 8, form);

/** MPEG audio: an ID3 tag, or a frame sync (eleven set bits). */
const isMp3 = (head: Uint8Array) =>
  ascii(head, 0, "ID3") ||
  (head.length >= 2 && head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0);

/** Readers accept a PDF header anywhere in the first kilobyte; some scanners rely on it. */
const isPdf = (head: Uint8Array) => {
  for (let offset = 0; offset <= head.length - 5; offset++) {
    if (ascii(head, offset, "%PDF-")) return true;
  }
  return false;
};

const SIGNATURES: Record<string, (head: Uint8Array) => boolean> = {
  "image/jpeg": (h) => bytes(h, 0, [0xff, 0xd8, 0xff]),
  "image/png": (h) => bytes(h, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": (h) => isRiff(h, "WEBP"),
  "image/gif": (h) => ascii(h, 0, "GIF8"),
  "image/heic": isIsoBmff,
  "image/tiff": (h) =>
    bytes(h, 0, [0x49, 0x49, 0x2a, 0x00]) || bytes(h, 0, [0x4d, 0x4d, 0x00, 0x2a]),
  "video/mp4": isIsoBmff,
  "video/quicktime": isIsoBmff,
  "video/webm": (h) => bytes(h, 0, [0x1a, 0x45, 0xdf, 0xa3]),
  "audio/mpeg": isMp3,
  "audio/mp4": isIsoBmff,
  "audio/x-m4a": isIsoBmff,
  "audio/wav": (h) => isRiff(h, "WAVE"),
  "audio/x-wav": (h) => isRiff(h, "WAVE"),
  "audio/ogg": (h) => ascii(h, 0, "OggS"),
  "application/pdf": isPdf,
};

/** True when `head` (the file's first bytes) looks like the declared MIME type. */
export function matchesUploadSignature(mimeType: string, head: Uint8Array): boolean {
  return SIGNATURES[mimeType]?.(head) ?? false;
}
