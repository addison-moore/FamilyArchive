import type { SessionUser } from "@familyarchive/auth";
import {
  getDb,
  people,
  personNames,
  places,
  relationships,
  sources,
  treeMemberships,
  trees,
} from "@familyarchive/db";
import { parseGedcom, type GedcomEvent, type GedcomIndividual } from "@familyarchive/gedcom";
import type { RelationshipType } from "@familyarchive/shared";
import { and, eq } from "drizzle-orm";

export interface GedcomImportResult {
  treeId: string;
  sourceId: string;
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
 * Import a GEDCOM file (PRD §14.3 as amended): either into an existing archive
 * (`targetTreeId` set — the import becomes a provenance source, §10.4) or into
 * a brand-new archive. Runs in one transaction; the caller has already checked
 * permission (archive admin, or archive-creation rights respectively).
 */
export async function importGedcom(
  user: SessionUser,
  fileName: string,
  text: string,
  options: { treeName?: string; targetTreeId?: string },
): Promise<GedcomImportResult> {
  const parsed = parseGedcom(text);
  if (parsed.individuals.length === 0) {
    throw new Error("No people found in this file — is it a GEDCOM export?");
  }

  const individualsByXref = new Map(parsed.individuals.map((i) => [i.xref, i]));
  const db = getDb();

  let relationshipCount = 0;
  const result = await db.transaction(async (tx) => {
    let treeId = options.targetTreeId;
    if (!treeId) {
      const name =
        options.treeName?.trim() ||
        fileName
          .replace(/\.ged$/i, "")
          .replace(/[_-]+/g, " ")
          .trim() ||
        "Imported archive";
      const treeRows = await tx
        .insert(trees)
        .values({
          name,
          description: `Created from ${fileName}`,
          createdBy: user.id,
        })
        .returning({ id: trees.id });
      const tree = treeRows[0];
      if (!tree) throw new Error("Failed to create archive");
      treeId = tree.id;
      await tx.insert(treeMemberships).values({ treeId, userId: user.id, role: "admin" });
    }

    // Provenance record (PRD §10.4) — both new-archive and into-archive imports.
    const sourceRows = await tx
      .insert(sources)
      .values({
        treeId,
        kind: "gedcom",
        fileName,
        importedBy: user.id,
        metadata: { header: parsed.header, warnings: parsed.warnings },
      })
      .returning({ id: sources.id });
    const sourceId = sourceRows[0]?.id;
    if (!sourceId) throw new Error("Failed to record import source");

    // Places: find-or-create within the archive (PRD §20.2; shared across sources).
    const placeIdByName = new Map<string, string>();
    const resolvePlace = async (raw: string | null | undefined): Promise<string | null> => {
      const displayName = raw?.trim();
      if (!displayName) return null;
      const cached = placeIdByName.get(displayName);
      if (cached) return cached;
      const existing = await tx
        .select({ id: places.id })
        .from(places)
        .where(and(eq(places.treeId, treeId!), eq(places.displayName, displayName)))
        .limit(1);
      let id = existing[0]?.id;
      if (!id) {
        const inserted = await tx
          .insert(places)
          .values({ treeId: treeId!, displayName, rawImported: displayName })
          .returning({ id: places.id });
        id = inserted[0]?.id;
      }
      if (!id) throw new Error(`Failed to resolve place: ${displayName}`);
      placeIdByName.set(displayName, id);
      return id;
    };

    // People, keyed back to their xref for relationship wiring.
    const personIdByXref = new Map<string, string>();
    for (const individual of parsed.individuals) {
      const rows = await tx
        .insert(people)
        .values({
          treeId,
          fullName: individual.fullName,
          gender: individual.gender,
          ...eventColumns(individual.birth, "birth"),
          ...eventColumns(individual.death, "death"),
          birthPlaceId: await resolvePlace(individual.birth?.place),
          deathPlaceId: await resolvePlace(individual.death?.place),
          notes: individual.notes.length > 0 ? individual.notes.join("\n\n") : null,
          createdBy: user.id,
          sourceId,
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
              treeId,
              fromPersonId: parentId,
              toPersonId: childId,
              type: parentType(individualsByXref.get(childXref), family.xref),
              sourceId,
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
            treeId,
            fromPersonId: parentIds[0]!,
            toPersonId: parentIds[1]!,
            type: partnerType(family),
            sourceId,
            metadata: { gedcom: { famXref: family.xref } },
          })
          .onConflictDoNothing();
        relationshipCount++;
      }
    }

    await tx
      .update(sources)
      .set({
        stats: { people: parsed.individuals.length, relationships: relationshipCount },
      })
      .where(eq(sources.id, sourceId));

    return { treeId, sourceId };
  });

  return {
    treeId: result.treeId,
    sourceId: result.sourceId,
    peopleCount: parsed.individuals.length,
    relationshipCount,
    warnings: parsed.warnings,
  };
}
