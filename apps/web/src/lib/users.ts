import { hashPassword, MIN_PASSWORD_LENGTH } from "@familyarchive/auth";
import { getDb, users } from "@familyarchive/db";
import { sql } from "drizzle-orm";
import type { GlobalRole } from "@familyarchive/shared";
import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
});

export async function anyUserExists(): Promise<boolean> {
  const rows = await getDb().select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

/** Returns the new user id, or null when the email is already registered. */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: GlobalRole;
}): Promise<string | null> {
  const passwordHash = await hashPassword(input.password);
  const rows = await getDb()
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash, role: input.role })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  return rows[0]?.id ?? null;
}

/** Arbitrary, stable key for the owner-bootstrap advisory lock. */
const OWNER_BOOTSTRAP_LOCK = 4_814_517_001;

/**
 * Create the instance Owner, but only while the instance genuinely has no
 * users. Returns "exists" when someone got there first.
 *
 * The check and the insert have to share a transaction with a lock: read then
 * act let two registrations submitted at the same moment both observe an empty
 * table and both be created as Owner, which is a privilege escalation an
 * attacker can race on a freshly deployed instance.
 */
export async function createOwnerIfFirst(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ status: "created"; id: string } | { status: "exists" } | { status: "duplicate" }> {
  const passwordHash = await hashPassword(input.password);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${OWNER_BOOTSTRAP_LOCK})`);
    const existing = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) return { status: "exists" as const };
    const rows = await tx
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash, role: "owner" })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    const id = rows[0]?.id;
    return id ? { status: "created" as const, id } : { status: "duplicate" as const };
  });
}
