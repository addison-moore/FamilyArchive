/**
 * Minimal GEDCOM parser/exporter. Implementation lands in Milestone 5 (PRD §14):
 * people, names, birth/death facts, parent-child and partner relationships, notes,
 * and raw GEDCOM preservation in metadata JSON.
 */

/** GEDCOM versions the v1 parser targets. */
export const SUPPORTED_GEDCOM_VERSIONS = ["5.5", "5.5.1"] as const;
