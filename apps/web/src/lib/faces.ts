import { getDb, mediaFaces, people } from "@familyarchive/db";
import { and, asc, eq, isNull } from "drizzle-orm";

export interface FaceBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number | null;
  detectedBy: string;
  personId: string | null;
  personName: string | null;
}

/** Face boxes for a media item with assigned person names. */
export async function listFaces(mediaId: string): Promise<FaceBox[]> {
  const rows = await getDb()
    .select({
      id: mediaFaces.id,
      x: mediaFaces.x,
      y: mediaFaces.y,
      width: mediaFaces.width,
      height: mediaFaces.height,
      confidence: mediaFaces.confidence,
      detectedBy: mediaFaces.detectedBy,
      personId: mediaFaces.personId,
      personName: people.fullName,
    })
    .from(mediaFaces)
    // Soft-deleting a person never clears media_faces (the FK's "set null"
    // only fires on a hard delete), so without this filter a deleted person
    // kept appearing by name on the face overlay.
    .leftJoin(people, and(eq(mediaFaces.personId, people.id), isNull(people.deletedAt)))
    .where(eq(mediaFaces.mediaId, mediaId))
    .orderBy(asc(mediaFaces.createdAt));
  return rows;
}
