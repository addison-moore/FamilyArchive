"use server";

import { requireTreeRole } from "@familyarchive/auth";
import { getDb, people, relationships, userTreePreferences } from "@familyarchive/db";
import {
  isParentRelationshipType,
  isPartnerRelationshipType,
  isRelationshipType,
} from "@familyarchive/shared";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPerson } from "@/lib/people";
import { isTreeViewMode } from "@/lib/tree-graph";

function treePath(treeId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  const query = params.toString();
  return `/trees/${treeId}${query ? `?${query}` : ""}`;
}

/** Personal preference (PRD §7.5) — any member can set their own starting person. */
export async function setStartingPersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const mode = String(formData.get("mode") ?? "both");
  const { user } = await requireTreeRole(treeId, "viewer");
  if (!(await getPerson(treeId, personId))) redirect(treePath(treeId));

  await getDb()
    .insert(userTreePreferences)
    .values({ userId: user.id, treeId, startingPersonId: personId })
    .onConflictDoUpdate({
      target: [userTreePreferences.userId, userTreePreferences.treeId],
      set: { startingPersonId: personId, updatedAt: new Date() },
    });
  redirect(
    treePath(treeId, {
      selected: personId,
      ...(isTreeViewMode(mode) && mode !== "both" ? { mode } : {}),
    }),
  );
}

const quickAddSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(300),
  birthYear: z.coerce.number().int().min(1).max(9999).optional(),
});

/**
 * Canvas quick-add (PRD §11.4): create a new person AND the relationship to the
 * anchor person in one step. Linking existing people lives on the profile page.
 */
export async function quickAddRelativeAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const anchorId = String(formData.get("personId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const type = String(formData.get("type") ?? "");
  const mode = String(formData.get("mode") ?? "both");
  const { user } = await requireTreeRole(treeId, "editor");

  const backParams: Record<string, string> = {
    selected: anchorId,
    ...(isTreeViewMode(mode) && mode !== "both" ? { mode } : {}),
  };
  const fail = (message: string) => redirect(treePath(treeId, { ...backParams, error: message }));

  const parsed = quickAddSchema.safeParse({
    fullName: formData.get("fullName"),
    birthYear: String(formData.get("birthYear") ?? "").trim() || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  if (!isRelationshipType(type)) return fail("Invalid relationship type");
  const typeMatchesDirection =
    direction === "partner"
      ? isPartnerRelationshipType(type)
      : (direction === "parent" || direction === "child") && isParentRelationshipType(type);
  if (!typeMatchesDirection) return fail("Relationship type does not match");
  if (!(await getPerson(treeId, anchorId))) return fail("Person not found");

  const newPersonId = await getDb().transaction(async (tx) => {
    const rows = await tx
      .insert(people)
      .values({
        treeId,
        fullName: parsed.data.fullName,
        birthYear: parsed.data.birthYear ?? null,
        createdBy: user.id,
      })
      .returning({ id: people.id });
    const created = rows[0];
    if (!created) throw new Error("Failed to create person");
    const [fromPersonId, toPersonId] =
      direction === "parent" ? [created.id, anchorId] : [anchorId, created.id];
    await tx.insert(relationships).values({ treeId, fromPersonId, toPersonId, type });
    return created.id;
  });

  redirect(
    treePath(treeId, {
      selected: newPersonId,
      ...(isTreeViewMode(mode) && mode !== "both" ? { mode } : {}),
    }),
  );
}
