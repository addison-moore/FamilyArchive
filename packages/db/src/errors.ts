/** Postgres SQLSTATE 23505 — a unique constraint or unique index rejected a row. */
const UNIQUE_VIOLATION = "23505";

/** Postgres SQLSTATE 23503 — a row refers to another row that does not exist. */
const FOREIGN_KEY_VIOLATION = "23503";

/** Guards against a cause chain that loops back on itself. */
const MAX_CAUSE_DEPTH = 5;

/**
 * The chain walk is load-bearing, not defensive: drizzle wraps driver failures
 * in its own error and the SQLSTATE lives on `cause`, so checking only the
 * thrown error's own `code` never matches and every lost race surfaces as a
 * 500. The shape is checked structurally because postgres-js exports no error
 * class to compare against.
 */
function hasSqlState(error: unknown, state: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === state
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * True when a write failed because it collided with a unique index.
 *
 * Callers use this to tell "the database arbitrated a race" apart from a
 * genuine failure, so a lost race can be reported as a conflict rather than a
 * server error.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, UNIQUE_VIOLATION);
}

/**
 * True when a write failed because the row it refers to no longer exists. A
 * background job uses this to notice its item was permanently removed mid-run.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasSqlState(error, FOREIGN_KEY_VIOLATION);
}
