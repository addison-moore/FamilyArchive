import { sql, type SQL } from "drizzle-orm";

import { mediaItems } from "./schema";

/** The per-subsystem sections of `media_items.metadata`. */
export type MediaMetadataSection = "processing" | "ocr" | "ai" | "faces" | "purge";

/**
 * A `metadata` value that merges `patch` into one section, for use in `.set()`.
 *
 * The merge happens inside the UPDATE. These sections are written from separate
 * jobs and from the web app, and each write used to read the whole document,
 * change its own key and write everything back, so two writers overlapping
 * silently undid each other: a media job finishing could reset an OCR status to
 * whatever it held when the job started.
 */
export function mergeMediaMetadata(
  section: MediaMetadataSection,
  patch: Record<string, unknown>,
): SQL {
  const path = sql`array[${section}::text]`;
  const existing = sql`coalesce(${mediaItems.metadata} -> ${section}::text, '{}'::jsonb)`;
  // ::text first so the driver sends the JSON as-is rather than serializing it again.
  const incoming = sql`${JSON.stringify(patch)}::text::jsonb`;
  return sql`jsonb_set(${mediaItems.metadata}, ${path}, ${existing} || ${incoming}, true)`;
}

/**
 * Has a permanent removal started for this item? From then on part of it may
 * already be gone from storage, so it can only be removed: not restored, and not
 * exported. The web app's `lib/trash.ts` sets this before it deletes anything.
 */
export function isPurgeStarted(metadata: unknown): boolean {
  return typeof metadata === "object" && metadata !== null && "purge" in metadata;
}
