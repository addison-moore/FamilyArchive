"use server";

import { requireMemberRole } from "@familyarchive/auth";
import { collectionMedia, collections, getDb } from "@familyarchive/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCollection } from "@/lib/collections";
import { getMediaItem } from "@/lib/media";

const collectionSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(5000).optional(),
    startYear: z.coerce.number().int().min(1).max(9999).optional(),
    endYear: z.coerce.number().int().min(1).max(9999).optional(),
  })
  .refine((v) => !v.startYear || !v.endYear || v.startYear <= v.endYear, {
    message: "Start year must not be after end year",
  });

function parseCollectionForm(formData: FormData) {
  return collectionSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    startYear: String(formData.get("startYear") ?? "").trim() || undefined,
    endYear: String(formData.get("endYear") ?? "").trim() || undefined,
  });
}

/** Create a collection (editor+, PRD §16). */
export async function createCollectionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const { user } = await requireMemberRole(treeId, "editor");

  const parsed = parseCollectionForm(formData);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/trees/${treeId}/collections/new?error=${encodeURIComponent(message)}`);
  }

  const rows = await getDb()
    .insert(collections)
    .values({
      treeId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      startYear: parsed.data.startYear ?? null,
      endYear: parsed.data.endYear ?? null,
      createdBy: user.id,
    })
    .returning({ id: collections.id });
  redirect(`/trees/${treeId}/collections/${rows[0]?.id}`);
}

export async function updateCollectionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  await requireMemberRole(treeId, "editor");
  if (!(await getCollection(treeId, collectionId))) redirect(`/trees/${treeId}/collections`);

  const path = `/trees/${treeId}/collections/${collectionId}`;
  const parsed = parseCollectionForm(formData);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }

  await getDb()
    .update(collections)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      startYear: parsed.data.startYear ?? null,
      endYear: parsed.data.endYear ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(collections.id, collectionId), eq(collections.treeId, treeId)));
  redirect(path);
}

/** Hard delete (collections are organization only — media is untouched). */
export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  await requireMemberRole(treeId, "editor");

  await getDb()
    .delete(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.treeId, treeId)));
  redirect(`/trees/${treeId}/collections`);
}

/** Cover image (PRD §16.2) — must be an image already in the collection. */
export async function setCollectionCoverAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  await requireMemberRole(treeId, "editor");
  if (!(await getCollection(treeId, collectionId))) return;

  const media = await getMediaItem(treeId, mediaId);
  if (!media || !media.mimeType.startsWith("image/")) return;
  const membership = await getDb()
    .select({ mediaId: collectionMedia.mediaId })
    .from(collectionMedia)
    .where(
      and(eq(collectionMedia.collectionId, collectionId), eq(collectionMedia.mediaId, mediaId)),
    )
    .limit(1);
  if (!membership[0]) return;

  await getDb()
    .update(collections)
    .set({ coverMediaId: mediaId, updatedAt: new Date() })
    .where(and(eq(collections.id, collectionId), eq(collections.treeId, treeId)));
  revalidatePath(`/trees/${treeId}/collections/${collectionId}`);
}

/** Add media to a collection (contributor+, PRD §8.4). */
export async function addMediaToCollectionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  await requireMemberRole(treeId, "contributor");
  if (!(await getCollection(treeId, collectionId)) || !(await getMediaItem(treeId, mediaId))) {
    return;
  }

  await getDb().insert(collectionMedia).values({ collectionId, mediaId }).onConflictDoNothing();
  revalidatePath(`/trees/${treeId}/media/${mediaId}`);
  revalidatePath(`/trees/${treeId}/collections/${collectionId}`);
}

export async function removeMediaFromCollectionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  await requireMemberRole(treeId, "contributor");
  if (!(await getCollection(treeId, collectionId))) return;

  await getDb()
    .delete(collectionMedia)
    .where(
      and(eq(collectionMedia.collectionId, collectionId), eq(collectionMedia.mediaId, mediaId)),
    );
  revalidatePath(`/trees/${treeId}/media/${mediaId}`);
  revalidatePath(`/trees/${treeId}/collections/${collectionId}`);
}
