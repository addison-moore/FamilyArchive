/**
 * Minimal GEDCOM parser/exporter: people, names, birth/death facts,
 * parent-child and partner relationships, notes, raw record preservation.
 */

export {
  decodeGedcom,
  declaredCharset,
  UnsupportedGedcomEncodingError,
  type DecodedGedcom,
} from "./encoding";
export { parseGedcom, SUPPORTED_GEDCOM_VERSIONS } from "./parse";
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
