/** Generic GEDCOM structure node; raw subtrees are preserved as these. */
export interface GedcomNode {
  level: number;
  tag: string;
  /** Record id for level-0 records (e.g. "@I1@"). */
  xref: string | null;
  value: string | null;
  children: GedcomNode[];
}

export interface GedcomDateParts {
  year: number | null;
  month: number | null;
  day: number | null;
  approx: boolean;
}

export interface GedcomEvent {
  dateRaw: string | null;
  date: GedcomDateParts | null;
  place: string | null;
}

export interface GedcomIndividual {
  xref: string;
  /** First NAME line with surname slashes stripped. */
  fullName: string;
  /** Additional NAME lines. */
  alternateNames: string[];
  gender: "male" | "female" | "unknown";
  birth: GedcomEvent | null;
  death: GedcomEvent | null;
  notes: string[];
  /** FAMC links: families this person is a child in, with optional PEDI. */
  childInFamilies: { famXref: string; pedigree: string | null }[];
  /** Full raw record for lossless preservation (PRD §14.6). */
  raw: GedcomNode;
}

export interface GedcomFamily {
  xref: string;
  husbandXref: string | null;
  wifeXref: string | null;
  childXrefs: string[];
  married: boolean;
  divorced: boolean;
  raw: GedcomNode;
}

export interface ParsedGedcom {
  individuals: GedcomIndividual[];
  families: GedcomFamily[];
  header: GedcomNode | null;
  warnings: string[];
}
