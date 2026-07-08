import { createHash, randomBytes } from "node:crypto";

import { getDb, users, verificationTokens } from "@familyarchive/db";
import { and, eq, gt, like } from "drizzle-orm";

/**
 * Password-reset tokens live in the (otherwise unused) Auth.js
 * `verification_tokens` table: identifier "pwreset:<email>", token = sha256 of
 * the raw value. The raw token exists only in the emailed link, so leaked
 * rows can't be replayed. One active token per email, 60-minute expiry,
 * single-use.
 */

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const identifierFor = (email: string) => `pwreset:${email}`;

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * Issues a fresh token for the email (replacing any previous one) and returns
 * the raw value for the emailed link, or null when no such account exists.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const db = getDb();
  const account = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (account.length === 0) return null;

  const raw = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, identifierFor(email)));
    await tx.insert(verificationTokens).values({
      identifier: identifierFor(email),
      token: hashToken(raw),
      expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
  });
  return raw;
}

/** Returns the email a raw token belongs to, or null when invalid/expired. */
export async function emailForResetToken(rawToken: string): Promise<string | null> {
  if (!rawToken) return null;
  const rows = await getDb()
    .select({ identifier: verificationTokens.identifier })
    .from(verificationTokens)
    .where(
      and(
        like(verificationTokens.identifier, "pwreset:%"),
        eq(verificationTokens.token, hashToken(rawToken)),
        gt(verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);
  const identifier = rows[0]?.identifier;
  return identifier ? identifier.slice("pwreset:".length) : null;
}

/** Sets the new password hash and burns every reset token for that email. */
export async function consumeResetToken(email: string, passwordHash: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, email));
    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, identifierFor(email)));
  });
}
