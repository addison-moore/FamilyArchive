/**
 * Minimal GEDCOM parser/exporter: people, names, birth/death facts,
 * parent-child and partner relationships, notes, raw record preservation.
 */

export { decodeGedcom, UnsupportedGedcomEncodingError } from "./encoding";
export { parseGedcom } from "./parse";
export type { GedcomEvent, GedcomIndividual } from "./types";
export { generateGedcom } from "./generate";
