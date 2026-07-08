import { getDb, treeMemberships, trees, users } from "@familyarchive/db";
import { treeRoleAtLeast, type TreeRole } from "@familyarchive/shared";
import { and, eq } from "drizzle-orm";

import { auth } from "./nextauth";

/**
 * Server-side authorization guards (PRD §8, §31.2). Roles are always read fresh
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
  return rows[0] ?? null;
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
 * The instance Owner can perform all admin actions on every tree (PRD §8.1),
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

/** True when the archive is in explicit public read-only mode (PRD §23). */
export async function isTreePublic(treeId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ isPublic: trees.isPublic })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);
  return rows[0]?.isPublic ?? false;
}

/**
 * Tree access guard (PRD §31.2, §23). Authenticated users get their real role.
 * Anonymous visitors get the pseudo-role "viewer" — with `user: null` — iff
 * the archive is public AND only viewer access is required; anything above
 * viewer always demands a signed-in member, so all mutations stay locked.
 */
export async function requireTreeRole(
  treeId: string,
  minimum: TreeRole,
): Promise<{ user: SessionUser | null; role: TreeRole }> {
  const user = await getSessionUser();
  if (!user) {
    if (minimum === "viewer" && (await isTreePublic(treeId))) {
      return { user: null, role: "viewer" };
    }
    throw new AuthorizationError("Sign in required");
  }
  const role = await getTreeRole(user, treeId);
  if (!role || !treeRoleAtLeast(role, minimum)) {
    throw new AuthorizationError(`Requires ${minimum} access to this tree`);
  }
  return { user, role };
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

/** Owner, or anyone holding an Admin membership on at least one tree (M2 decision). */
export async function canCreateTrees(user: SessionUser): Promise<boolean> {
  if (user.role === "owner") return true;
  const rows = await getDb()
    .select({ id: treeMemberships.id })
    .from(treeMemberships)
    .where(and(eq(treeMemberships.userId, user.id), eq(treeMemberships.role, "admin")))
    .limit(1);
  return rows.length > 0;
}
