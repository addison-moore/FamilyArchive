import { getDb, treeMemberships, trees, users } from "@familyarchive/db";
import { treeRoleAtLeast, type TreeRole } from "@familyarchive/shared";
import { and, eq } from "drizzle-orm";

import { auth } from "./nextauth";

/**
 * Server-side authorization guards. Roles are always read fresh
 * from the database — the JWT only carries the user id — so role changes take
 * effect immediately. Every server action and tree-scoped page must go through
 * these.
 */

export type SessionUser = typeof users.$inferSelect;

/** Thrown when the caller is unauthenticated or lacks the required role. */
export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  const user = rows[0];
  if (!user) return null;
  // A password reset bumps users.updatedAt, so any token stamped before that
  // was issued against the old credentials and is no longer valid. Sessions
  // predating the stamp carry no value and are left alone.
  const stamp = session?.credentialsStamp;
  if (typeof stamp === "number" && user.updatedAt.getTime() > stamp) return null;
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("Sign in required");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "owner") throw new AuthorizationError("Owner role required");
  return user;
}

/**
 * The caller's effective role on a tree, or null when they have no access.
 * The instance Owner can perform all admin actions on every tree,
 * so owners resolve to "admin" everywhere.
 */
export async function getTreeRole(user: SessionUser, treeId: string): Promise<TreeRole | null> {
  if (user.role === "owner") return "admin";
  const rows = await getDb()
    .select({ role: treeMemberships.role })
    .from(treeMemberships)
    .where(and(eq(treeMemberships.treeId, treeId), eq(treeMemberships.userId, user.id)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/** True when the archive is in explicit public read-only mode. */
export async function isTreePublic(treeId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ isPublic: trees.isPublic })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);
  return rows[0]?.isPublic ?? false;
}

/**
 * Tree access guard. Members get their real role. Everyone else — anonymous or
 * signed in — falls back to the pseudo-role "viewer" iff the archive is public
 * AND only viewer access is required; anything above viewer always demands a
 * member, so all mutations stay locked.
 *
 * The public fallback has to sit below the membership lookup, not only on the
 * anonymous branch: checking it before the lookup meant a signed-in non-member
 * was rejected outright, so anonymous visitors could read a public archive that
 * logged-in users got a 404 for.
 */
export async function requireTreeRole(
  treeId: string,
  minimum: TreeRole,
): Promise<{ user: SessionUser | null; role: TreeRole }> {
  const user = await getSessionUser();
  const role = user ? await getTreeRole(user, treeId) : null;
  if (role) {
    if (!treeRoleAtLeast(role, minimum)) {
      throw new AuthorizationError(`Requires ${minimum} access to this tree`);
    }
    return { user, role };
  }
  if (minimum === "viewer" && (await isTreePublic(treeId))) {
    return { user, role: "viewer" };
  }
  throw new AuthorizationError(
    user ? `Requires ${minimum} access to this tree` : "Sign in required",
  );
}

/** Like requireTreeRole but never grants anonymous access — for mutations that need a user row. */
export async function requireMemberRole(
  treeId: string,
  minimum: TreeRole,
): Promise<{ user: SessionUser; role: TreeRole }> {
  const user = await requireUser();
  const role = await getTreeRole(user, treeId);
  if (!role || !treeRoleAtLeast(role, minimum)) {
    throw new AuthorizationError(`Requires ${minimum} access to this tree`);
  }
  return { user, role };
}

/** Owner, or anyone holding an Admin membership on at least one tree. */
export async function canCreateTrees(user: SessionUser): Promise<boolean> {
  if (user.role === "owner") return true;
  const rows = await getDb()
    .select({ id: treeMemberships.id })
    .from(treeMemberships)
    .where(and(eq(treeMemberships.userId, user.id), eq(treeMemberships.role, "admin")))
    .limit(1);
  return rows.length > 0;
}
