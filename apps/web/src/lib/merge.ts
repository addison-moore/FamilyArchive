import {
  getDb,
  mediaFaces,
  mediaPeople,
  people,
  personNames,
  relationships,
  userTreePreferences,
} from "@familyarchive/db";
import { isPartnerRelationshipType } from "@familyarchive/shared";
import { and, eq, isNull, or } from "drizzle-orm";

import type { PersonRow } from "@/lib/people";

/** Which record's value survives, per field group (PRD §10.5). */
export interface MergeFieldChoices {
  fullName: "survivor" | "other";
  gender: "survivor" | "other";
  birth: "survivor" | "other";
  death: "survivor" | "other";
  biography: "survivor" | "other" | "both";
  notes: "survivor" | "other" | "both";
}

function pickText(
  choice: "survivor" | "other" | "both",
  survivor: string | null,
  other: string | null,
): string | null {
  if (choice === "both") {
    const parts = [survivor, other].filter((t): t is string => Boolean(t?.trim()));
    return parts.length > 0 ? parts.join("\n\n") : null;
  }
  return choice === "other" ? other : survivor;
}

/**
 * Merge `other` into `survivor` (PRD §10.5), in one transaction:
 * every reference re-points to the survivor, provenance (incl. raw GEDCOM) is
 * preserved in the survivor's metadata, and the other record is soft-deleted
 * with a pointer back. Manual and human-driven — no auto-matching.
 */
export async function mergePeople(
  treeId: string,
  survivorId: string,
  otherId: string,
  choices: MergeFieldChoices,
  mergedBy: string,
): Promise<void> {
  if (survivorId === otherId) throw new Error("Cannot merge a person into themselves");
  const db = getDb();

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(people)
      .where(and(eq(people.treeId, treeId), isNull(people.deletedAt)));
    const survivor = rows.find((p) => p.id === survivorId);
    const other = rows.find((p) => p.id === otherId);
    if (!survivor || !other) throw new Error("Person not found in this archive");

    // 1. Scalar fields per choices.
    const birthSource: PersonRow = choices.birth === "other" ? other : survivor;
    const deathSource: PersonRow = choices.death === "other" ? other : survivor;
    const nameSource = choices.fullName === "other" ? other : survivor;
    const genderSource = choices.gender === "other" ? other : survivor;
    await tx
      .update(people)
      .set({
        fullName: nameSource.fullName,
        gender: genderSource.gender,
        genderCustom: genderSource.genderCustom,
        birthYear: birthSource.birthYear,
        birthMonth: birthSource.birthMonth,
        birthDay: birthSource.birthDay,
        birthApprox: birthSource.birthApprox,
        birthPlaceId: birthSource.birthPlaceId,
        deathYear: deathSource.deathYear,
        deathMonth: deathSource.deathMonth,
        deathDay: deathSource.deathDay,
        deathApprox: deathSource.deathApprox,
        deathPlaceId: deathSource.deathPlaceId,
        biography: pickText(choices.biography, survivor.biography, other.biography),
        notes: pickText(choices.notes, survivor.notes, other.notes),
        profileMediaId: survivor.profileMediaId ?? other.profileMediaId,
        updatedAt: new Date(),
      })
      .where(eq(people.id, survivorId));

    // 2. Relationships: re-point other→survivor, dropping self-edges and
    //    duplicates (incl. mirrored partner edges). Check-first — a unique
    //    violation would abort the whole transaction.
    const otherEdges = await tx
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.treeId, treeId),
          or(eq(relationships.fromPersonId, otherId), eq(relationships.toPersonId, otherId)),
        ),
      );
    for (const edge of otherEdges) {
      const newFrom = edge.fromPersonId === otherId ? survivorId : edge.fromPersonId;
      const newTo = edge.toPersonId === otherId ? survivorId : edge.toPersonId;
      if (newFrom === newTo) {
        await tx.delete(relationships).where(eq(relationships.id, edge.id));
        continue;
      }
      const duplicates = await tx
        .select({ id: relationships.id })
        .from(relationships)
        .where(
          and(
            eq(relationships.treeId, treeId),
            eq(relationships.type, edge.type),
            isPartnerRelationshipType(edge.type)
              ? or(
                  and(eq(relationships.fromPersonId, newFrom), eq(relationships.toPersonId, newTo)),
                  and(eq(relationships.fromPersonId, newTo), eq(relationships.toPersonId, newFrom)),
                )
              : and(eq(relationships.fromPersonId, newFrom), eq(relationships.toPersonId, newTo)),
          ),
        );
      if (duplicates.some((d) => d.id !== edge.id)) {
        await tx.delete(relationships).where(eq(relationships.id, edge.id));
      } else {
        await tx
          .update(relationships)
          .set({ fromPersonId: newFrom, toPersonId: newTo, updatedAt: new Date() })
          .where(eq(relationships.id, edge.id));
      }
    }

    // 3. Media people-tags (unique per media+person → check-first).
    const otherMediaTags = await tx
      .select()
      .from(mediaPeople)
      .where(eq(mediaPeople.personId, otherId));
    for (const tag of otherMediaTags) {
      const existing = await tx
        .select({ id: mediaPeople.id })
        .from(mediaPeople)
        .where(and(eq(mediaPeople.mediaId, tag.mediaId), eq(mediaPeople.personId, survivorId)))
        .limit(1);
      if (existing[0]) {
        await tx.delete(mediaPeople).where(eq(mediaPeople.id, tag.id));
      } else {
        await tx
          .update(mediaPeople)
          .set({ personId: survivorId })
          .where(eq(mediaPeople.id, tag.id));
      }
    }

    // 4. Face tags, alternate names, starting-person preferences.
    await tx
      .update(mediaFaces)
      .set({ personId: survivorId, updatedAt: new Date() })
      .where(eq(mediaFaces.personId, otherId));
    await tx
      .update(personNames)
      .set({ personId: survivorId })
      .where(eq(personNames.personId, otherId));
    const survivorNames = await tx
      .select({ name: personNames.name })
      .from(personNames)
      .where(eq(personNames.personId, survivorId));
    const finalName = nameSource.fullName.toLowerCase();
    for (const candidate of [survivor.fullName, other.fullName]) {
      if (
        candidate.toLowerCase() !== finalName &&
        !survivorNames.some((n) => n.name.toLowerCase() === candidate.toLowerCase())
      ) {
        await tx
          .insert(personNames)
          .values({ personId: survivorId, name: candidate, kind: "also_known_as" });
        survivorNames.push({ name: candidate });
      }
    }
    await tx
      .update(userTreePreferences)
      .set({ startingPersonId: survivorId, updatedAt: new Date() })
      .where(eq(userTreePreferences.startingPersonId, otherId));

    // 5. Provenance on the survivor; soft-delete the other with a pointer.
    const survivorMeta = { ...(survivor.metadata as Record<string, unknown>) };
    const merges = Array.isArray(survivorMeta.merges) ? [...survivorMeta.merges] : [];
    const otherMeta = other.metadata as Record<string, unknown>;
    merges.push({
      mergedPersonId: otherId,
      mergedPersonName: other.fullName,
      mergedBy,
      mergedAt: new Date().toISOString(),
      sourceId: other.sourceId,
      gedcom: otherMeta.gedcom ?? null,
    });
    survivorMeta.merges = merges;
    await tx.update(people).set({ metadata: survivorMeta }).where(eq(people.id, survivorId));

    await tx
      .update(people)
      .set({
        deletedAt: new Date(),
        deletedBy: mergedBy,
        metadata: { ...otherMeta, mergedInto: survivorId },
      })
      .where(eq(people.id, otherId));
  });
}
