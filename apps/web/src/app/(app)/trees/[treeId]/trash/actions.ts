"use server";

import { requireMemberRole } from "@familyarchive/auth";
import { parsePageSize } from "@familyarchive/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseTrashView,
  purgeMedia,
  purgePerson,
  restoreMedia,
  restorePerson,
  TrashError,
  trashUrl,
} from "@/lib/trash";

/** The refusal to show, when the work was refused for a reason the person can act on. */
async function refusal(work: () => Promise<void>): Promise<TrashError | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof TrashError) return error;
    throw error;
  }
}

/** Typed, like the other irreversible actions: merging and deleting an archive. */
function confirmed(formData: FormData): boolean {
  return (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() === "REMOVE"
  );
}

const CONFIRM_MESSAGE = 'Type "REMOVE" to confirm';

/** Restore a media item (editor+). `after=item` is Undo, which returns to the item itself. */
export async function restoreMediaAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const { user } = await requireMemberRole(treeId, "editor");

  const refused = await refusal(() => restoreMedia(treeId, mediaId, user.id));
  revalidatePath(`/trees/${treeId}`, "layout");
  if (refused) {
    redirect(
      trashUrl(treeId, "media", {
        error: refused.message,
        ...(refused.duplicateOf ? { duplicateOf: refused.duplicateOf } : {}),
      }),
    );
  }
  redirect(
    formData.get("after") === "item"
      ? `/trees/${treeId}/media/${mediaId}`
      : trashUrl(treeId, "media", { restored: mediaId }),
  );
}

/** Restore a person (editor+). `after=item` is Undo, which returns to the person. */
export async function restorePersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const { user } = await requireMemberRole(treeId, "editor");

  const refused = await refusal(() => restorePerson(treeId, personId, user.id));
  revalidatePath(`/trees/${treeId}`, "layout");
  if (refused) redirect(trashUrl(treeId, "people", { error: refused.message }));
  redirect(
    formData.get("after") === "item"
      ? `/trees/${treeId}/people/${personId}`
      : trashUrl(treeId, "people", { restored: personId }),
  );
}

/** Permanently remove a media item (admin+). */
export async function purgeMediaAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const { user } = await requireMemberRole(treeId, "admin");
  if (!confirmed(formData)) redirect(trashUrl(treeId, "media", { error: CONFIRM_MESSAGE }));

  const refused = await refusal(() => purgeMedia(treeId, mediaId, user.id));
  revalidatePath(`/trees/${treeId}`, "layout");
  redirect(trashUrl(treeId, "media", refused ? { error: refused.message } : { removed: "1" }));
}

/** Permanently remove a person, or a merged-away record (admin+). */
export async function purgePersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const view = parseTrashView(formData.get("view")) === "merged" ? "merged" : "people";
  const { user } = await requireMemberRole(treeId, "admin");
  if (!confirmed(formData)) redirect(trashUrl(treeId, view, { error: CONFIRM_MESSAGE }));

  const refused = await refusal(() => purgePerson(treeId, personId, user.id));
  revalidatePath(`/trees/${treeId}`, "layout");
  redirect(trashUrl(treeId, view, refused ? { error: refused.message } : { removed: "1" }));
}

/** Rows per page, in the URL like the media grid's. Returns to the first page. */
export async function setTrashPageSizeAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  await requireMemberRole(treeId, "editor");
  const size = parsePageSize(formData.get("size"));
  redirect(
    trashUrl(treeId, parseTrashView(formData.get("view")), size ? { size: String(size) } : {}),
  );
}
