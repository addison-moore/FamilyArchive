"use server";

import { requireTreeRole } from "@familyarchive/auth";
import { parsePageSize } from "@familyarchive/shared";
import { redirect } from "next/navigation";

/**
 * Rows-per-page for the media grid. Unlike the People list this rides in the
 * URL for everyone rather than being stored per user: there is no
 * media_page_size column, and adding one is a schema change that belongs in its
 * own plan. Always returns to the first page — the old page number rarely
 * survives a resize meaningfully.
 */
export async function setMediaPageSizeAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  await requireTreeRole(treeId, "viewer");

  const params = new URLSearchParams();
  for (const name of ["type", "tag", "person", "mine", "scope", "collection"]) {
    const value = String(formData.get(name) ?? "").trim();
    if (value) params.set(name, value);
  }
  const size = parsePageSize(formData.get("size"));
  if (size) params.set("size", String(size));

  const query = params.toString();
  redirect(`/trees/${treeId}/media${query ? `?${query}` : ""}`);
}
