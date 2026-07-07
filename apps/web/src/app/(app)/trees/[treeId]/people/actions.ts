"use server";

import { requireTreeRole } from "@familyarchive/auth";
import { getDb, people, personNames, relationships } from "@familyarchive/db";
import {
  isGender,
  isParentRelationshipType,
  isPartnerRelationshipType,
  isPersonNameKind,
  isRelationshipType,
  validateDateParts,
  type DateParts,
} from "@familyarchive/shared";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPerson, resolvePlaceId } from "@/lib/people";

function peoplePath(treeId: string): string {
  return `/trees/${treeId}/people`;
}

function datePartsFromForm(formData: FormData, prefix: "birth" | "death"): DateParts {
  const part = (name: string): number | null => {
    const raw = String(formData.get(`${prefix}${name}`) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : NaN;
  };
  return {
    year: part("Year"),
    month: part("Month"),
    day: part("Day"),
    approx: formData.get(`${prefix}Approx`) === "on",
  };
}

const personFieldsSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(300),
  gender: z.string().refine(isGender, "Invalid gender"),
  genderCustom: z.string().trim().max(100).optional(),
  biography: z.string().trim().max(20_000).optional(),
  notes: z.string().trim().max(20_000).optional(),
  birthPlace: z.string().trim().max(300).optional(),
  deathPlace: z.string().trim().max(300).optional(),
});

interface ParsedPersonForm {
  fields: z.infer<typeof personFieldsSchema>;
  birth: DateParts;
  death: DateParts;
}

function parsePersonForm(formData: FormData): ParsedPersonForm | string {
  const parsed = personFieldsSchema.safeParse({
    fullName: formData.get("fullName"),
    gender: formData.get("gender"),
    genderCustom: String(formData.get("genderCustom") ?? "").trim() || undefined,
    biography: String(formData.get("biography") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    birthPlace: String(formData.get("birthPlace") ?? "").trim() || undefined,
    deathPlace: String(formData.get("deathPlace") ?? "").trim() || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input";

  const birth = datePartsFromForm(formData, "birth");
  const death = datePartsFromForm(formData, "death");
  for (const parts of [birth, death]) {
    if ([parts.year, parts.month, parts.day].some((v) => Number.isNaN(v))) {
      return "Dates must be whole numbers";
    }
    const dateError = validateDateParts(parts);
    if (dateError) return dateError;
  }
  return { fields: parsed.data, birth, death };
}

function personValues(form: ParsedPersonForm) {
  return {
    fullName: form.fields.fullName,
    gender: form.fields.gender,
    genderCustom: form.fields.gender === "custom" ? (form.fields.genderCustom ?? null) : null,
    biography: form.fields.biography ?? null,
    notes: form.fields.notes ?? null,
    birthYear: form.birth.year,
    birthMonth: form.birth.month,
    birthDay: form.birth.day,
    birthApprox: form.birth.approx,
    deathYear: form.death.year,
    deathMonth: form.death.month,
    deathDay: form.death.day,
    deathApprox: form.death.approx,
  };
}

export async function createPersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const { user } = await requireTreeRole(treeId, "editor");

  const form = parsePersonForm(formData);
  if (typeof form === "string") {
    redirect(`${peoplePath(treeId)}/new?error=${encodeURIComponent(form)}`);
  }

  const [birthPlaceId, deathPlaceId] = await Promise.all([
    resolvePlaceId(treeId, form.fields.birthPlace ?? null),
    resolvePlaceId(treeId, form.fields.deathPlace ?? null),
  ]);

  const rows = await getDb()
    .insert(people)
    .values({
      treeId,
      ...personValues(form),
      birthPlaceId,
      deathPlaceId,
      createdBy: user.id,
    })
    .returning({ id: people.id });
  redirect(`${peoplePath(treeId)}/${rows[0]?.id}`);
}

export async function updatePersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  await requireTreeRole(treeId, "editor");
  if (!(await getPerson(treeId, personId))) redirect(peoplePath(treeId));

  const form = parsePersonForm(formData);
  if (typeof form === "string") {
    redirect(`${peoplePath(treeId)}/${personId}/edit?error=${encodeURIComponent(form)}`);
  }

  const [birthPlaceId, deathPlaceId] = await Promise.all([
    resolvePlaceId(treeId, form.fields.birthPlace ?? null),
    resolvePlaceId(treeId, form.fields.deathPlace ?? null),
  ]);

  await getDb()
    .update(people)
    .set({ ...personValues(form), birthPlaceId, deathPlaceId, updatedAt: new Date() })
    .where(and(eq(people.id, personId), eq(people.treeId, treeId), isNull(people.deletedAt)));
  redirect(`${peoplePath(treeId)}/${personId}`);
}

/** Soft delete (PRD §28.2, CLAUDE.md): the row is kept, flagged, and filtered out. */
export async function deletePersonAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const { user } = await requireTreeRole(treeId, "editor");

  await getDb()
    .update(people)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(and(eq(people.id, personId), eq(people.treeId, treeId), isNull(people.deletedAt)));
  redirect(peoplePath(treeId));
}

export async function addPersonNameAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  await requireTreeRole(treeId, "editor");
  if (!name || name.length > 300 || !(await getPerson(treeId, personId))) return;

  await getDb()
    .insert(personNames)
    .values({ personId, name, kind: isPersonNameKind(kindRaw) ? kindRaw : null });
  revalidatePath(`${peoplePath(treeId)}/${personId}/edit`);
}

export async function removePersonNameAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const nameId = String(formData.get("nameId") ?? "");
  await requireTreeRole(treeId, "editor");
  if (!(await getPerson(treeId, personId))) return;

  await getDb()
    .delete(personNames)
    .where(and(eq(personNames.id, nameId), eq(personNames.personId, personId)));
  revalidatePath(`${peoplePath(treeId)}/${personId}/edit`);
}

/**
 * Add a relationship from a person's profile. `direction` gives the anchor
 * person's perspective; parent edges are stored parent→child (PRD §13.2).
 */
export async function addRelationshipAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const otherPersonId = String(formData.get("otherPersonId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const type = String(formData.get("type") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await requireTreeRole(treeId, "editor");

  const profilePath = `${peoplePath(treeId)}/${personId}`;
  const fail = (message: string): never =>
    redirect(`${profilePath}?error=${encodeURIComponent(message)}`);

  if (!isRelationshipType(type)) return fail("Invalid relationship type");
  if (personId === otherPersonId) return fail("A person cannot be related to themselves");
  const typeMatchesDirection =
    direction === "partner"
      ? isPartnerRelationshipType(type)
      : (direction === "parent" || direction === "child") && isParentRelationshipType(type);
  if (!typeMatchesDirection) return fail("Relationship type does not match");

  const [anchor, other] = await Promise.all([
    getPerson(treeId, personId),
    getPerson(treeId, otherPersonId),
  ]);
  if (!anchor || !other) return fail("Person not found in this tree");

  const [fromPersonId, toPersonId] =
    direction === "parent" ? [otherPersonId, personId] : [personId, otherPersonId];

  // Partner edges are symmetric — reject the mirrored duplicate too.
  if (isPartnerRelationshipType(type)) {
    const mirrored = await getDb()
      .select({ id: relationships.id })
      .from(relationships)
      .where(
        and(
          eq(relationships.treeId, treeId),
          eq(relationships.fromPersonId, toPersonId),
          eq(relationships.toPersonId, fromPersonId),
          eq(relationships.type, type),
        ),
      )
      .limit(1);
    if (mirrored.length > 0) return fail("That relationship already exists");
  }

  await getDb()
    .insert(relationships)
    .values({ treeId, fromPersonId, toPersonId, type, notes })
    .onConflictDoNothing();
  redirect(profilePath);
}

export async function removeRelationshipAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const relationshipId = String(formData.get("relationshipId") ?? "");
  await requireTreeRole(treeId, "editor");

  await getDb()
    .delete(relationships)
    .where(and(eq(relationships.id, relationshipId), eq(relationships.treeId, treeId)));
  revalidatePath(`${peoplePath(treeId)}/${personId}`);
}
