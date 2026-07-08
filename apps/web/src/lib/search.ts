import { collections, getDb, mediaItems, people, personNames, places } from "@familyarchive/db";
import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";

import type { CollectionRow } from "@/lib/collections";
import type { MediaRow } from "@/lib/media";
import type { PersonRow } from "@/lib/people";

const RESULT_LIMIT = 50;

export interface SearchFilters {
  mediaType?: string;
  tagId?: string;
  personId?: string;
  uploaderId?: string;
  year?: number;
}

export interface PlaceResult {
  id: string;
  displayName: string;
}

export interface SearchResults {
  people: PersonRow[];
  media: MediaRow[];
  collections: CollectionRow[];
  places: PlaceResult[];
}

/** Escape LIKE wildcards in user input; used with ILIKE for name-ish fields. */
function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

/**
 * Archive-wide search (PRD §19): Postgres FTS (websearch_to_tsquery) over text
 * bodies — expressions match the GIN indexes from migrations 0006/0009 — plus
 * ILIKE for proper nouns (names, titles, places, tags) where stemming misses.
 * Results grouped by type (§19.4); optional branch scoping (§10.6) is applied
 * by the caller for people/media via `branchIds`.
 */
export async function searchArchive(
  treeId: string,
  q: string,
  filters: SearchFilters,
  branchIds: Set<string> | null,
): Promise<SearchResults> {
  const db = getDb();
  const pattern = likePattern(q);
  const tsQuery = sql`websearch_to_tsquery('english', ${q})`;

  // --- People (§19.2: names, alternate names, biographies, notes, places) ---
  const peopleTextVector = sql`to_tsvector('english', coalesce(${people.fullName}, '') || ' ' || coalesce(${people.biography}, '') || ' ' || coalesce(${people.notes}, ''))`;
  const peopleConditions: SQL[] = [
    eq(people.treeId, treeId),
    isNull(people.deletedAt),
    or(
      sql`${people.fullName} ILIKE ${pattern}`,
      sql`${peopleTextVector} @@ ${tsQuery}`,
      sql`exists (select 1 from ${personNames} pn where pn.person_id = ${people.id} and pn.name ILIKE ${pattern})`,
      sql`exists (select 1 from ${places} pl where (pl.id = ${people.birthPlaceId} or pl.id = ${people.deathPlaceId}) and pl.display_name ILIKE ${pattern})`,
    )!,
  ];
  if (filters.personId) peopleConditions.push(eq(people.id, filters.personId));
  if (filters.year !== undefined) {
    peopleConditions.push(
      or(eq(people.birthYear, filters.year), eq(people.deathYear, filters.year))!,
    );
  }
  let peopleResults = filters.mediaType
    ? []
    : await db
        .select()
        .from(people)
        .where(and(...peopleConditions))
        .orderBy(people.fullName)
        .limit(RESULT_LIMIT);
  if (branchIds) peopleResults = peopleResults.filter((p) => branchIds.has(p.id));

  // --- Media (§19.2: titles, captions, tags, people tags, OCR, transcription) ---
  const mediaTextVector = sql`to_tsvector('english', coalesce(${mediaItems.title}, '') || ' ' || coalesce(${mediaItems.description}, ''))`;
  const ocrVector = sql`to_tsvector('english', coalesce(${mediaItems.ocrText}, ''))`;
  const transcriptionVector = sql`to_tsvector('english', coalesce(${mediaItems.transcriptionText}, ''))`;
  const mediaConditions: SQL[] = [
    eq(mediaItems.treeId, treeId),
    isNull(mediaItems.deletedAt),
    or(
      sql`${mediaItems.title} ILIKE ${pattern}`,
      sql`${mediaItems.originalFilename} ILIKE ${pattern}`,
      sql`${mediaTextVector} @@ ${tsQuery}`,
      sql`${ocrVector} @@ ${tsQuery}`,
      sql`${transcriptionVector} @@ ${tsQuery}`,
      sql`exists (select 1 from media_tags mt join tags t on t.id = mt.tag_id where mt.media_id = ${mediaItems.id} and t.name ILIKE ${pattern})`,
      sql`exists (select 1 from media_people mp join people p on p.id = mp.person_id where mp.media_id = ${mediaItems.id} and p.full_name ILIKE ${pattern} and p.deleted_at is null)`,
      sql`exists (select 1 from media_faces mf join people p on p.id = mf.person_id where mf.media_id = ${mediaItems.id} and p.full_name ILIKE ${pattern} and p.deleted_at is null)`,
      sql`exists (select 1 from ${places} pl where pl.id = ${mediaItems.placeId} and pl.display_name ILIKE ${pattern})`,
    )!,
  ];
  if (filters.mediaType) {
    mediaConditions.push(eq(mediaItems.mediaType, filters.mediaType as MediaRow["mediaType"]));
  }
  if (filters.uploaderId) mediaConditions.push(eq(mediaItems.uploaderId, filters.uploaderId));
  if (filters.year !== undefined) mediaConditions.push(eq(mediaItems.dateYear, filters.year));
  if (filters.tagId) {
    mediaConditions.push(
      sql`exists (select 1 from media_tags mt where mt.media_id = ${mediaItems.id} and mt.tag_id = ${filters.tagId})`,
    );
  }
  if (filters.personId) {
    mediaConditions.push(
      sql`(exists (select 1 from media_people mp where mp.media_id = ${mediaItems.id} and mp.person_id = ${filters.personId})
        or exists (select 1 from media_faces mf where mf.media_id = ${mediaItems.id} and mf.person_id = ${filters.personId}))`,
    );
  }
  let mediaResults = await db
    .select()
    .from(mediaItems)
    .where(and(...mediaConditions))
    .orderBy(sql`${mediaItems.createdAt} desc`)
    .limit(RESULT_LIMIT);
  if (branchIds) {
    // Same rule as the media grid: hide items tagged exclusively out-of-branch.
    const { taggedPersonIdsByMedia } = await import("@/lib/media");
    const taggedBy = await taggedPersonIdsByMedia(mediaResults.map((m) => m.id));
    mediaResults = mediaResults.filter((m) => {
      const tagged = taggedBy.get(m.id);
      if (!tagged || tagged.length === 0) return true;
      return tagged.some((personId) => branchIds.has(personId));
    });
  }

  // --- Collections (name/description; archive-wide in both scopes) ---
  const collectionConditions: SQL[] = [
    eq(collections.treeId, treeId),
    or(
      sql`${collections.name} ILIKE ${pattern}`,
      sql`${collections.description} ILIKE ${pattern}`,
    )!,
  ];
  if (filters.year !== undefined) {
    collectionConditions.push(
      sql`(${collections.startYear} is not null and ${collections.endYear} is not null and ${filters.year} between ${collections.startYear} and ${collections.endYear})
        or ${collections.startYear} = ${filters.year} or ${collections.endYear} = ${filters.year}`,
    );
  }
  const collectionResults = filters.mediaType
    ? []
    : await db
        .select()
        .from(collections)
        .where(and(...collectionConditions))
        .orderBy(collections.name)
        .limit(RESULT_LIMIT);

  // --- Places (display name) ---
  const placeResults = filters.mediaType
    ? []
    : await db
        .select({ id: places.id, displayName: places.displayName })
        .from(places)
        .where(and(eq(places.treeId, treeId), sql`${places.displayName} ILIKE ${pattern}`))
        .orderBy(places.displayName)
        .limit(RESULT_LIMIT);

  return {
    people: peopleResults,
    media: mediaResults,
    collections: collectionResults,
    places: placeResults,
  };
}
