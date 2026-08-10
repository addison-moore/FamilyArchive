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
