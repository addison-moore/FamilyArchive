import { formatGedcomDate } from "./dates";
import type { GedcomDateParts } from "./types";

export interface ExportEvent {
  date: GedcomDateParts | null;
  place: string | null;
}

export interface ExportIndividual {
  /** Caller-side key (person id); mapped to @I<n>@ xrefs by array order. */
  id: string;
  fullName: string;
  alternateNames: string[];
  /** FamilyArchive gender values; nonbinary/custom export as SEX U. */
  gender: string;
  birth: ExportEvent | null;
  death: ExportEvent | null;
  notes: string[];
}

export interface ExportFamily {
  /** 1–2 parent ids. */
  parentIds: string[];
  childIds: string[];
  /** Partner relationship between the parents, when one exists. */
  kind: "spouse" | "divorced_spouse" | "partner" | "former_partner" | null;
  /** PEDI value per child id ("adopted" / "foster"), omitted otherwise. */
  childPedigree?: Record<string, string>;
}

function nameLine(fullName: string): string {
  // GEDCOM wants the surname in slashes; best-effort: last word is the surname.
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName.trim();
  return `${parts.slice(0, -1).join(" ")} /${parts[parts.length - 1]}/`;
}

function sexValue(gender: string): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return "U";
}

function pushNote(lines: string[], level: number, note: string): void {
  const [first, ...rest] = note.split("\n");
  lines.push(`${level} NOTE ${first ?? ""}`.trimEnd());
  for (const cont of rest) {
    lines.push(`${level + 1} CONT ${cont}`.trimEnd());
  }
}

function pushEvent(lines: string[], tag: string, event: ExportEvent | null): void {
  if (!event) return;
  const date = event.date ? formatGedcomDate(event.date) : null;
  if (!date && !event.place) return;
  lines.push(`1 ${tag}`);
  if (date) lines.push(`2 DATE ${date}`);
  if (event.place) lines.push(`2 PLAC ${event.place}`);
}

/**
 * Generate a minimal GEDCOM 5.5.1 file (PRD §14.5). Structured data only —
 * preserved raw metadata is not re-emitted in v1. HUSB/WIFE roles follow
 * gender when unambiguous; otherwise parents fill HUSB then WIFE positionally
 * (a GEDCOM 5.5.1 format limitation, noted in the docs).
 */
export function buildGedcom(input: {
  individuals: ExportIndividual[];
  families: ExportFamily[];
  sourceName?: string;
}): string {
  const individualXref = new Map<string, string>();
  input.individuals.forEach((person, index) => {
    individualXref.set(person.id, `@I${index + 1}@`);
  });

  const famsOf = new Map<string, string[]>(); // person id -> family xrefs as parent
  const famcOf = new Map<string, { famXref: string; pedigree?: string }[]>();
  const familyXrefs: string[] = [];
  input.families.forEach((family, index) => {
    const famXref = `@F${index + 1}@`;
    familyXrefs.push(famXref);
    for (const parentId of family.parentIds) {
      famsOf.set(parentId, [...(famsOf.get(parentId) ?? []), famXref]);
    }
    for (const childId of family.childIds) {
      famcOf.set(childId, [
        ...(famcOf.get(childId) ?? []),
        { famXref, pedigree: family.childPedigree?.[childId] },
      ]);
    }
  });

  const lines: string[] = [
    "0 HEAD",
    `1 SOUR FamilyArchive`,
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
  ];
  if (input.sourceName) lines.push(`1 FILE ${input.sourceName}`);

  for (const person of input.individuals) {
    lines.push(`0 ${individualXref.get(person.id)} INDI`);
    lines.push(`1 NAME ${nameLine(person.fullName)}`);
    for (const altName of person.alternateNames) {
      lines.push(`1 NAME ${nameLine(altName)}`);
    }
    lines.push(`1 SEX ${sexValue(person.gender)}`);
    pushEvent(lines, "BIRT", person.birth);
    pushEvent(lines, "DEAT", person.death);
    for (const note of person.notes) {
      if (note.trim()) pushNote(lines, 1, note);
    }
    for (const link of famcOf.get(person.id) ?? []) {
      lines.push(`1 FAMC ${link.famXref}`);
      if (link.pedigree) lines.push(`2 PEDI ${link.pedigree}`);
    }
    for (const famXref of famsOf.get(person.id) ?? []) {
      lines.push(`1 FAMS ${famXref}`);
    }
  }

  input.families.forEach((family, index) => {
    lines.push(`0 ${familyXrefs[index]} FAM`);
    const parents = family.parentIds
      .map((id) => ({
        id,
        xref: individualXref.get(id),
        person: input.individuals.find((p) => p.id === id),
      }))
      .filter((p) => p.xref);
    const husband =
      parents.find((p) => p.person?.gender === "male") ??
      parents.find((p) => p.person?.gender !== "female");
    const wife = parents.find((p) => p !== husband);
    if (husband) lines.push(`1 HUSB ${husband.xref}`);
    if (wife) lines.push(`1 WIFE ${wife.xref}`);
    for (const childId of family.childIds) {
      const xref = individualXref.get(childId);
      if (xref) lines.push(`1 CHIL ${xref}`);
    }
    if (family.kind === "spouse" || family.kind === "divorced_spouse") {
      lines.push("1 MARR Y");
    }
    if (family.kind === "divorced_spouse") {
      lines.push("1 DIV Y");
    }
  });

  lines.push("0 TRLR");
  return lines.join("\n") + "\n";
}
