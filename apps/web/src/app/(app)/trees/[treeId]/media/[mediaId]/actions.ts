"use server";

import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaItems, mediaPeople, mediaTags, people, tags } from "@familyarchive/db";
import { isMediaType, validateDateParts } from "@familyarchive/shared";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enqueueMediaProcessing } from "@/lib/jobs";
import { canEditMedia, getMediaItem } from "@/lib/media";
import { getPerson, resolvePlaceId } from "@/lib/people";

function mediaPath(treeId: string, mediaId: string): string {
  return `/trees/${treeId}/media/${mediaId}`;
}

const metadataSchema = z.object({
  title: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  mediaType: z.string().refine(isMediaType, "Invalid media type"),
  place: z.string().trim().max(300).optional(),
});

export async function updateMediaAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const { user, role } = await requireTreeRole(treeId, "contributor");
  const media = await getMediaItem(treeId, mediaId);
  if (!media) redirect(`/trees/${treeId}/media`);
  if (!canEditMedia(user, role, media)) {
    throw new AuthorizationError("You can only edit metadata of your own uploads");
  }

  const fail = (message: string) =>
    redirect(`${mediaPath(treeId, mediaId)}?error=${encodeURIComponent(message)}`);

  const parsed = metadataSchema.safeParse({
    title: String(formData.get("title") ?? "").trim() || undefined,
    description: String(formData.get("description") ?? "").trim() || undefined,
    mediaType: formData.get("mediaType"),
    place: String(formData.get("place") ?? "").trim() || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const datePart = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : NaN;
  };
  const date = {
    year: datePart("dateYear"),
    month: datePart("dateMonth"),
    day: datePart("dateDay"),
    approx: formData.get("dateApprox") === "on",
  };
  if ([date.year, date.month, date.day].some(Number.isNaN)) return fail("Dates must be numbers");
  const dateError = validateDateParts(date);
  if (dateError) return fail(dateError);

  const placeId = await resolvePlaceId(treeId, parsed.data.place ?? null);
  await getDb()
    .update(mediaItems)
    .set({
      title: parsed.data.title ?? null,
      description: parsed.data.description ?? null,
      mediaType: parsed.data.mediaType,
      dateYear: date.year,
      dateMonth: date.month,
      dateDay: date.day,
      dateApprox: date.approx,
      placeId,
      updatedAt: new Date(),
    })
    .where(and(eq(mediaItems.id, mediaId), eq(mediaItems.treeId, treeId)));
  redirect(mediaPath(treeId, mediaId));
}

/** Soft delete (PRD §15, CLAUDE.md). The original file stays in storage (§5.6). */
export async function deleteMediaAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const { user } = await requireTreeRole(treeId, "editor");

  await getDb()
    .update(mediaItems)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(
      and(eq(mediaItems.id, mediaId), eq(mediaItems.treeId, treeId), isNull(mediaItems.deletedAt)),
    );
  redirect(`/trees/${treeId}/media`);
}

/** Tags: contributor+ may tag any media (PRD §8.4). */
export async function addMediaTagAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  await requireTreeRole(treeId, "contributor");
  if (!name || !(await getMediaItem(treeId, mediaId))) return;

  const db = getDb();
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.treeId, treeId), eq(tags.name, name)))
    .limit(1);
  let tagId = existing[0]?.id;
  if (!tagId) {
    const inserted = await db
      .insert(tags)
      .values({ treeId, name })
      .onConflictDoNothing()
      .returning({ id: tags.id });
    tagId = inserted[0]?.id;
  }
  if (tagId) {
    await db.insert(mediaTags).values({ mediaId, tagId }).onConflictDoNothing();
  }
  revalidatePath(mediaPath(treeId, mediaId));
}

export async function removeMediaTagAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const tagId = String(formData.get("tagId") ?? "");
  await requireTreeRole(treeId, "contributor");
  if (!(await getMediaItem(treeId, mediaId))) return;

  await getDb()
    .delete(mediaTags)
    .where(and(eq(mediaTags.mediaId, mediaId), eq(mediaTags.tagId, tagId)));
  revalidatePath(mediaPath(treeId, mediaId));
}

/** People tags: contributor+ (PRD §8.4 "tag people in media"). */
export async function addMediaPersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const { user } = await requireTreeRole(treeId, "contributor");
  if (!(await getMediaItem(treeId, mediaId)) || !(await getPerson(treeId, personId))) return;

  await getDb()
    .insert(mediaPeople)
    .values({ mediaId, personId, createdBy: user.id })
    .onConflictDoNothing();
  revalidatePath(mediaPath(treeId, mediaId));
}

export async function removeMediaPersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const tagRowId = String(formData.get("tagRowId") ?? "");
  await requireTreeRole(treeId, "contributor");
  if (!(await getMediaItem(treeId, mediaId))) return;

  await getDb()
    .delete(mediaPeople)
    .where(and(eq(mediaPeople.id, tagRowId), eq(mediaPeople.mediaId, mediaId)));
  revalidatePath(mediaPath(treeId, mediaId));
}

/** Retry a failed job or regenerate derivatives (editor+, PRD §15.6/§26.5). */
export async function reprocessMediaAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  await requireTreeRole(treeId, "editor");
  if (!(await getMediaItem(treeId, mediaId))) return;

  await getDb()
    .update(mediaItems)
    .set({ processingStatus: "pending", updatedAt: new Date() })
    .where(and(eq(mediaItems.id, mediaId), eq(mediaItems.treeId, treeId)));
  await enqueueMediaProcessing(treeId, mediaId);
  revalidatePath(mediaPath(treeId, mediaId));
}

/** Assign as a person's profile photo (editor+, PRD §8.4/§12.5). */
export async function setProfilePhotoAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  await requireTreeRole(treeId, "editor");
  const media = await getMediaItem(treeId, mediaId);
  if (!media || !media.mimeType.startsWith("image/") || !(await getPerson(treeId, personId))) {
    return;
  }

  await getDb()
    .update(people)
    .set({ profileMediaId: mediaId, updatedAt: new Date() })
    .where(and(eq(people.id, personId), eq(people.treeId, treeId)));
  revalidatePath(mediaPath(treeId, mediaId));
  revalidatePath(`/trees/${treeId}/people/${personId}`);
}
