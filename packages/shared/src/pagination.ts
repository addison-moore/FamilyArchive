/** List pagination: the page sizes users can pick, and parsing of untrusted input. */

/** Rows-per-page options offered on paginated lists, smallest first. */
export const PAGE_SIZES = [50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 50;

export function isPageSize(value: unknown): value is PageSize {
  return typeof value === "number" && (PAGE_SIZES as readonly number[]).includes(value);
}

/**
 * A page size from a URL param or stored preference, or null when unusable —
 * callers fall back to the next source (stored preference, then the default).
 */
export function parsePageSize(value: unknown): PageSize | null {
  const size = typeof value === "string" ? Number(value) : value;
  return isPageSize(size) ? size : null;
}

/** Pages needed to show `total` rows at `size` per page; always at least 1. */
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/** A 1-based page number from untrusted input, clamped to the pages that exist. */
export function resolvePageNumber(value: unknown, totalPages: number): number {
  const raw = typeof value === "string" ? Number(value) : value;
  const page = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : 1;
  return Math.min(page, Math.max(1, totalPages));
}
