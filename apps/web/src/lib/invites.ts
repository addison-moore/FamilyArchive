import { randomBytes } from "node:crypto";

import { getDb, invites } from "@familyarchive/db";
import { eq } from "drizzle-orm";

export const DEFAULT_INVITE_EXPIRY_DAYS = 7;

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export type InviteRow = typeof invites.$inferSelect;

/** An invite that exists, hasn't been revoked, and hasn't expired. */
export async function getValidInvite(token: string): Promise<InviteRow | null> {
  const rows = await getDb().select().from(invites).where(eq(invites.token, token)).limit(1);
  const invite = rows[0];
  if (!invite || invite.revokedAt || invite.expiresAt < new Date()) return null;
  return invite;
}
