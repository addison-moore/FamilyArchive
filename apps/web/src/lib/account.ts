import {
  consumeRateLimit,
  CURRENT_PASSWORD_PER_USER,
  resetRateLimit,
  type SessionUser,
  verifyPassword,
} from "@familyarchive/auth";
import { getDb, isUniqueViolation, users } from "@familyarchive/db";
import { and, eq } from "drizzle-orm";

import { clearResetTokens } from "@/lib/password-reset";

/**
 * Self-service account changes.
 *
 * `users.updatedAt` doubles as "credentials changed at": the session guard rejects
 * any token older than it. So only `changePassword` may write it here. A name or
 * email edit that bumped it would sign the person out of every device.
 */

/**
 * Checks the current password before a change to the password or the sign-in email.
 * Those two can take over an account from a borrowed session, so proving the password
 * is the point, and the limit stops that session guessing it.
 */
export async function checkCurrentPassword(
  user: SessionUser,
  password: string,
): Promise<"ok" | "wrong" | "throttled"> {
  const key = `account:password:${user.id}`;
  const limit = await consumeRateLimit(key, CURRENT_PASSWORD_PER_USER);
  if (!limit.allowed) return "throttled";
  if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) return "wrong";
  await resetRateLimit(key);
  return "ok";
}

export async function updateName(userId: string, name: string): Promise<void> {
  await getDb().update(users).set({ name }).where(eq(users.id, userId));
}

/** Returns false when another account already has that address. */
export async function changeEmail(user: SessionUser, email: string): Promise<boolean> {
  try {
    await getDb().transaction(async (tx) => {
      await tx.update(users).set({ email }).where(eq(users.id, user.id));
      await clearResetTokens(tx, user.email);
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Saves the new hash and revokes every session, including the caller's: re-issue it
 * afterwards by signing in with the new password. Returns false when the password
 * changed since the caller checked it, so a reset landing in between isn't overwritten.
 */
export async function changePassword(user: SessionUser, passwordHash: string): Promise<boolean> {
  if (!user.passwordHash) return false;
  const checkedHash = user.passwordHash;
  return getDb().transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, checkedHash)))
      .returning({ id: users.id });
    if (updated.length === 0) return false;
    await clearResetTokens(tx, user.email);
    return true;
  });
}
