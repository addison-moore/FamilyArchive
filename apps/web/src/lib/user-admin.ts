import { auditLogs, getDb, invites, treeMemberships, trees, users } from "@familyarchive/db";
import type { GlobalRole, TreeRole } from "@familyarchive/shared";
import { and, count, eq, isNull, ne, or, sql } from "drizzle-orm";

import { clearResetTokens } from "@/lib/password-reset";

/** Owner-only user management (PRD §8.1, §9.4). Callers enforce `requireOwner`. */

export interface ManagedUser {
  id: string;
  name: string | null;
  email: string;
  role: GlobalRole;
  createdAt: Date;
  archives: { id: string; name: string; role: TreeRole; soleAdmin: boolean }[];
}

/** Every account with its archives, the Owner first and then by name. */
export async function listUsersWithArchives(): Promise<ManagedUser[]> {
  const db = getDb();
  const [accounts, memberships, adminCounts] = await Promise.all([
    // Named columns: the password hash has no business leaving the database here.
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users),
    db
      .select({
        userId: treeMemberships.userId,
        treeId: trees.id,
        treeName: trees.name,
        role: treeMemberships.role,
      })
      .from(treeMemberships)
      .innerJoin(trees, eq(treeMemberships.treeId, trees.id))
      .orderBy(trees.name),
    db
      .select({ treeId: treeMemberships.treeId, admins: count() })
      .from(treeMemberships)
      .where(eq(treeMemberships.role, "admin"))
      .groupBy(treeMemberships.treeId),
  ]);

  const admins = new Map(adminCounts.map((row) => [row.treeId, row.admins]));
  return accounts
    .map((account) => ({
      ...account,
      archives: memberships
        .filter((membership) => membership.userId === account.id)
        .map((membership) => ({
          id: membership.treeId,
          name: membership.treeName,
          role: membership.role,
          soleAdmin: membership.role === "admin" && admins.get(membership.treeId) === 1,
        })),
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return (a.name ?? a.email).localeCompare(b.name ?? b.email);
    });
}

/** What the reset-link action hands back to the page. */
export interface ResetLinkState {
  url?: string;
  error?: string;
}

/** The account a reset link would be for, and the archives to record that in. */
export async function getResetLinkTarget(
  userId: string,
): Promise<{ name: string | null; email: string; role: GlobalRole; treeIds: string[] } | null> {
  const db = getDb();
  const [target] = await db
    .select({ name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return null;
  const memberships = await db
    .select({ treeId: treeMemberships.treeId })
    .from(treeMemberships)
    .where(eq(treeMemberships.userId, userId));
  return { ...target, treeIds: memberships.map((row) => row.treeId) };
}

export type RemoveUserResult =
  | { status: "missing" | "owner" | "mismatch" }
  | {
      status: "removed";
      label: string;
      email: string;
      /** Archives to audit this in, with how many invite links it revoked in each. */
      archives: Map<string, number>;
    };

/**
 * Deletes an account and keeps what the person contributed (PRD §9.4). Foreign keys
 * do most of it: memberships and preferences cascade, while every "who did this"
 * column goes null. The rest needs doing by hand, in one transaction so a failure
 * can't leave an account half removed:
 *
 * - Audit entries lose their actor to that same null, and an empty actor reads as
 *   "system". That would misattribute everything they did, and misbehaviour is a
 *   likely reason for removing someone, so each entry records who it was first.
 * - Invite links are bearer tokens, so one the person made or was sent would let them
 *   straight back in.
 * - A pending reset token is keyed on the address, which is now free to be claimed.
 */
export async function removeUser(userId: string, confirmEmail: string): Promise<RemoveUserResult> {
  return getDb().transaction(async (tx) => {
    const [target] = await tx
      .select({ name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!target) return { status: "missing" };
    if (target.role === "owner") return { status: "owner" };
    if (target.email !== confirmEmail) return { status: "mismatch" };

    const label = target.name ?? target.email;
    await tx
      .update(auditLogs)
      .set({
        metadata: sql`${auditLogs.metadata} || ${JSON.stringify({ formerActor: `${label} (removed)` })}::text::jsonb`,
      })
      .where(eq(auditLogs.actorId, userId));

    const memberships = await tx
      .select({ treeId: treeMemberships.treeId })
      .from(treeMemberships)
      .where(eq(treeMemberships.userId, userId));
    const revoked = await tx
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          isNull(invites.revokedAt),
          or(eq(invites.createdBy, userId), eq(invites.email, target.email)),
        ),
      )
      .returning({ treeId: invites.treeId });

    await clearResetTokens(tx, target.email);
    await tx.delete(users).where(and(eq(users.id, userId), ne(users.role, "owner")));

    const archives = new Map<string, number>(memberships.map((row) => [row.treeId, 0]));
    for (const { treeId } of revoked) archives.set(treeId, (archives.get(treeId) ?? 0) + 1);
    return { status: "removed", label, email: target.email, archives };
  });
}
