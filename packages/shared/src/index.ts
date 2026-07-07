/**
 * Shared types and utilities used across FamilyArchive apps and packages.
 * Grows as milestones land; keep entries generic (no app- or DB-specific code).
 */

/** Nominal typing helper for entity IDs (e.g. `Brand<string, "TreeId">`). */
export type Brand<T, Name extends string> = T & { readonly __brand: Name };

/** Exhaustiveness check for discriminated unions. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

export * from "./roles";
export * from "./jobs";
export * from "./people";
export * from "./dates";
export * from "./media";
export * from "./processing";
