import { getDb, mediaFaces, people } from "@familyarchive/db";
import { asc, eq } from "drizzle-orm";

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

/** Face boxes for a media item with assigned person names (PRD §17.6). */
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
    .leftJoin(people, eq(mediaFaces.personId, people.id))
    .where(eq(mediaFaces.mediaId, mediaId))
    .orderBy(asc(mediaFaces.createdAt));
  return rows;
}
