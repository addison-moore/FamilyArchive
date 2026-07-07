import type { SessionUser } from "@familyarchive/auth";
import { getDb, treeMemberships, trees } from "@familyarchive/db";
import type { TreeRole } from "@familyarchive/shared";
import { desc, eq } from "drizzle-orm";

export interface AccessibleTree {
  id: string;
  name: string;
  description: string | null;
  role: TreeRole;
}

/** Trees the user can open: all of them for the Owner (PRD §8.1), else memberships. */
export async function getAccessibleTrees(user: SessionUser): Promise<AccessibleTree[]> {
  const db = getDb();
  if (user.role === "owner") {
    const rows = await db
      .select({ id: trees.id, name: trees.name, description: trees.description })
      .from(trees)
      .orderBy(desc(trees.createdAt));
    return rows.map((row) => ({ ...row, role: "admin" as const }));
  }
  const rows = await db
    .select({
      id: trees.id,
      name: trees.name,
      description: trees.description,
      role: treeMemberships.role,
    })
    .from(treeMemberships)
    .innerJoin(trees, eq(treeMemberships.treeId, trees.id))
    .where(eq(treeMemberships.userId, user.id))
    .orderBy(desc(trees.createdAt));
  return rows;
}
