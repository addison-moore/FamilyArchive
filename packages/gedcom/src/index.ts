/**
 * Minimal GEDCOM parser/exporter (PRD §14): people, names, birth/death facts,
 * parent-child and partner relationships, notes, raw record preservation.
 */

export const SUPPORTED_GEDCOM_VERSIONS = ["5.5", "5.5.1"] as const;

export { parseGedcom } from "./parse";
export { buildGedcom } from "./export";
export type { ExportEvent, ExportFamily, ExportIndividual } from "./export";
export { formatGedcomDate, parseGedcomDate } from "./dates";
export type {
  GedcomDateParts,
  GedcomEvent,
  GedcomFamily,
  GedcomIndividual,
  GedcomNode,
  ParsedGedcom,
} from "./types";
export { generateGedcom } from "./generate";
