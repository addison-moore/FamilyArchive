import { getDb, userTreePreferences } from "@familyarchive/db";
import { DEFAULT_PAGE_SIZE, parsePageSize, type PageSize } from "@familyarchive/shared";
import { and, eq } from "drizzle-orm";

/** Per-user, per-tree browsing preferences that outlive a session. */

/**
 * The user's saved rows-per-page for the People list. Anonymous visitors on a
 * public archive have nothing stored, so they get the default; a stored value
 * that is no longer on the menu also falls back rather than being trusted.
 */
export async function storedPeoplePageSize(
  userId: string | null,
  treeId: string,
): Promise<PageSize> {
  if (!userId) return DEFAULT_PAGE_SIZE;
  const rows = await getDb()
    .select({ peoplePageSize: userTreePreferences.peoplePageSize })
    .from(userTreePreferences)
    .where(and(eq(userTreePreferences.userId, userId), eq(userTreePreferences.treeId, treeId)))
    .limit(1);
  return parsePageSize(rows[0]?.peoplePageSize) ?? DEFAULT_PAGE_SIZE;
}

/** Remember the user's rows-per-page choice for future visits and sessions. */
export async function savePeoplePageSize(
  userId: string,
  treeId: string,
  size: PageSize,
): Promise<void> {
  await getDb()
    .insert(userTreePreferences)
    .values({ userId, treeId, peoplePageSize: size })
    .onConflictDoUpdate({
      target: [userTreePreferences.userId, userTreePreferences.treeId],
      set: { peoplePageSize: size, updatedAt: new Date() },
    });
}
