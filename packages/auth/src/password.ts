import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * A real bcrypt hash of a value nobody can supply, used to spend the same work
 * on a sign-in for an address that has no account.
 *
 * Returning early in that case is measurable: verifying a real account costs
 * ~210ms at cost 12 while an unknown address answered in ~4ms, which is an
 * account-enumeration oracle — and one that undoes the trouble the
 * password-reset flow goes to in order not to reveal which addresses are
 * registered. Generated at cost 12 so the timings match.
 */
const ABSENT_USER_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.4wLc0zJ9vHjNGCEPXY6EJHBZ0Nn.Ike";

/**
 * Spend a comparable amount of time when there is no account to check, so the
 * response time does not reveal whether the address is registered.
 */
export async function verifyAbsentUser(password: string): Promise<void> {
  await bcrypt.compare(password, ABSENT_USER_HASH).catch(() => false);
}
