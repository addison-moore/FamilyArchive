import type { SessionUser } from "@familyarchive/auth";
import {
  getDb,
  people,
  personNames,
  places,
  relationships,
  treeMemberships,
  trees,
} from "@familyarchive/db";
import { parseGedcom, type GedcomEvent, type GedcomIndividual } from "@familyarchive/gedcom";
import type { RelationshipType } from "@familyarchive/shared";

export interface GedcomImportResult {
  treeId: string;
  peopleCount: number;
  relationshipCount: number;
  warnings: string[];
}

function eventColumns(event: GedcomEvent | null, prefix: "birth" | "death") {
  return {
    [`${prefix}Year`]: event?.date?.year ?? null,
    [`${prefix}Month`]: event?.date?.month ?? null,
    [`${prefix}Day`]: event?.date?.day ?? null,
    [`${prefix}Approx`]: event?.date?.approx ?? false,
  };
}

function partnerType(family: { married: boolean; divorced: boolean }): RelationshipType {
  if (family.divorced) return "divorced_spouse";
  if (family.married) return "spouse";
  return "partner";
}

function parentType(child: GedcomIndividual | undefined, famXref: string): RelationshipType {
  const pedigree = child?.childInFamilies.find((f) => f.famXref === famXref)?.pedigree;
  if (pedigree === "adopted") return "adoptive_parent";
  if (pedigree === "foster") return "foster_parent";
  return "biological_parent";
}

/**
 * Import a GEDCOM file into a brand-new tree (PRD §14.3) with raw record
 * preservation (§14.6). Runs in one transaction; the caller has already been
 * checked for tree-creation permission.
 */
export async function importGedcom(
  user: SessionUser,
  fileName: string,
  text: string,
  treeName: string | undefined,
): Promise<GedcomImportResult> {
  const parsed = parseGedcom(text);
  if (parsed.individuals.length === 0) {
    throw new Error("No people found in this file — is it a GEDCOM export?");
  }

  const name =
    treeName?.trim() ||
    fileName
      .replace(/\.ged$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() ||
    "Imported tree";

  const individualsByXref = new Map(parsed.individuals.map((i) => [i.xref, i]));
  const db = getDb();

  let relationshipCount = 0;
  const treeId = await db.transaction(async (tx) => {
    const treeRows = await tx
      .insert(trees)
      .values({
        name,
        description: `Imported from ${fileName}`,
        createdBy: user.id,
        metadata: {
          gedcom: {
            sourceFileName: fileName,
            importedAt: new Date().toISOString(),
            header: parsed.header,
            warnings: parsed.warnings,
          },
        },
      })
      .returning({ id: trees.id });
    const tree = treeRows[0];
    if (!tree) throw new Error("Failed to create tree");
    await tx.insert(treeMemberships).values({ treeId: tree.id, userId: user.id, role: "admin" });

    // Places: one row per distinct PLAC value (PRD §20.2, raw value preserved).
    const placeIdByName = new Map<string, string>();
    const placeNames = new Set<string>();
    for (const person of parsed.individuals) {
      for (const place of [person.birth?.place, person.death?.place]) {
        if (place?.trim()) placeNames.add(place.trim());
      }
    }
    for (const displayName of placeNames) {
      const rows = await tx
        .insert(places)
        .values({ treeId: tree.id, displayName, rawImported: displayName })
        .returning({ id: places.id });
      if (rows[0]) placeIdByName.set(displayName, rows[0].id);
    }

    // People, keyed back to their xref for relationship wiring.
    const personIdByXref = new Map<string, string>();
    for (const individual of parsed.individuals) {
      const rows = await tx
        .insert(people)
        .values({
          treeId: tree.id,
          fullName: individual.fullName,
          gender: individual.gender,
          ...eventColumns(individual.birth, "birth"),
          ...eventColumns(individual.death, "death"),
          birthPlaceId: individual.birth?.place
            ? (placeIdByName.get(individual.birth.place.trim()) ?? null)
            : null,
          deathPlaceId: individual.death?.place
            ? (placeIdByName.get(individual.death.place.trim()) ?? null)
            : null,
          notes: individual.notes.length > 0 ? individual.notes.join("\n\n") : null,
          createdBy: user.id,
          metadata: {
            gedcom: {
              xref: individual.xref,
              raw: individual.raw,
              birthDateRaw: individual.birth?.dateRaw ?? null,
              deathDateRaw: individual.death?.dateRaw ?? null,
            },
          },
        })
        .returning({ id: people.id });
      const created = rows[0];
      if (!created) throw new Error(`Failed to import ${individual.fullName}`);
      personIdByXref.set(individual.xref, created.id);

      if (individual.alternateNames.length > 0) {
        await tx.insert(personNames).values(
          individual.alternateNames.map((altName) => ({
            personId: created.id,
            name: altName,
            kind: null,
          })),
        );
      }
    }

    // Relationships from FAM records (PRD §13.2 mapping).
    for (const family of parsed.families) {
      const parentXrefs = [family.husbandXref, family.wifeXref].filter(
        (x): x is string => x !== null,
      );
      const parentIds = parentXrefs
        .map((xref) => personIdByXref.get(xref))
        .filter((id): id is string => id !== undefined);

      for (const parentXref of parentXrefs) {
        const parentId = personIdByXref.get(parentXref);
        if (!parentId) continue;
        for (const childXref of family.childXrefs) {
          const childId = personIdByXref.get(childXref);
          if (!childId || childId === parentId) continue;
          await tx
            .insert(relationships)
            .values({
              treeId: tree.id,
              fromPersonId: parentId,
              toPersonId: childId,
              type: parentType(individualsByXref.get(childXref), family.xref),
              metadata: { gedcom: { famXref: family.xref } },
            })
            .onConflictDoNothing();
          relationshipCount++;
        }
      }

      if (parentIds.length === 2 && parentIds[0] !== parentIds[1]) {
        await tx
          .insert(relationships)
          .values({
            treeId: tree.id,
            fromPersonId: parentIds[0]!,
            toPersonId: parentIds[1]!,
            type: partnerType(family),
            metadata: { gedcom: { famXref: family.xref } },
          })
          .onConflictDoNothing();
        relationshipCount++;
      }
    }

    return tree.id;
  });

  return {
    treeId,
    peopleCount: parsed.individuals.length,
    relationshipCount,
    warnings: parsed.warnings,
  };
}
