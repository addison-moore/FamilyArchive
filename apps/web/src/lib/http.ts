import { timingSafeEqual } from "node:crypto";

/**
 * HTTP header helpers.
 *
 * Header values are ByteStrings: constructing a `Response` with any code unit
 * above 0xFF throws a TypeError. Uploaded filenames are only stripped of control
 * characters and path separators, so a CJK, Cyrillic, Greek or emoji name is
 * stored verbatim and would otherwise make the file permanently unservable.
 */

/**
 * RFC 6266 `Content-Disposition`. Emits both an ASCII-folded `filename` for old
 * clients and the exact name in `filename*` (RFC 5987), which every current
 * browser prefers.
 */
export function contentDisposition(disposition: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  const fallback = ascii.trim() || "download";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Constant-time string comparison for secrets (bearer tokens, reset tokens).
 * `===`/`!==` short-circuit at the first differing byte, which leaks the secret
 * to an attacker who can measure response time. Lengths are compared first
 * because `timingSafeEqual` throws on a length mismatch — that much is already
 * observable from the input itself.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * A same-origin path from untrusted input, or `fallback`. Checking for a leading
 * "/" and rejecting "//" is not enough: browsers read a backslash as a slash and
 * strip tabs and newlines before parsing, so "/\\evil.test" and "/\t/evil.test"
 * both leave the site.
 */
export function safeRedirectPath(value: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  if (!value.startsWith("/") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  return value.startsWith("//") ? fallback : value;
}

/**
 * The single byte range in a Range header, or undefined to serve the whole file.
 * RFC 9110 has a recipient ignore an invalid range, and one ending before it
 * starts is invalid: it used to reach createReadStream and come back as a 500.
 */
export function parseByteRange(header: string | null): { start: number; end?: number } | undefined {
  const match = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  return end !== undefined && end < start ? undefined : { start, end };
}

/**
 * `decodeURIComponent` that yields the raw input instead of throwing. Client
 * headers are attacker-controlled and a stray `%` is enough to raise a
 * URIError, which would surface as a 500 from an otherwise valid request.
 */
export function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
