import { hashPassword } from "@familyarchive/auth";
import { getDb, users } from "@familyarchive/db";
import type { GlobalRole } from "@familyarchive/shared";
import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
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
