import { parseGedcomDate } from "./dates";
import type {
  GedcomEvent,
  GedcomFamily,
  GedcomIndividual,
  GedcomNode,
  ParsedGedcom,
} from "./types";

/** GEDCOM line: LEVEL [XREF] TAG [VALUE]. Tags may be vendor extensions (_UID). */
const LINE_PATTERN = /^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

function buildNodeTree(text: string, warnings: string[]): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const match = line.match(LINE_PATTERN);
    if (!match) {
      warnings.push(`Skipped malformed line ${index + 1}: ${line.slice(0, 60)}`);
      continue;
    }
    const node: GedcomNode = {
      level: Number(match[1]),
      xref: match[2] ?? null,
      tag: match[3]!.toUpperCase(),
      value: match[4] ?? null,
      children: [],
    };
    while (stack.length > node.level) stack.pop();
    if (node.level === 0) {
      roots.push(node);
      stack.length = 0;
      stack.push(node);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent) {
        warnings.push(`Skipped orphan line ${index + 1} (level ${node.level} without parent)`);
        continue;
      }
      parent.children.push(node);
      stack.push(node);
    }
  }
  return roots;
}

/** Fold CONT (newline) / CONC (concatenate) continuation children into values. */
function foldContinuations(node: GedcomNode): void {
  const kept: GedcomNode[] = [];
  for (const child of node.children) {
    if (child.tag === "CONT") {
      node.value = `${node.value ?? ""}\n${child.value ?? ""}`;
    } else if (child.tag === "CONC") {
      node.value = `${node.value ?? ""}${child.value ?? ""}`;
    } else {
      foldContinuations(child);
      kept.push(child);
    }
  }
  node.children = kept;
}

function child(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

function childValues(node: GedcomNode, tag: string): string[] {
  return node.children.filter((c) => c.tag === tag && c.value).map((c) => c.value!);
}

function cleanName(nameValue: string): string {
  // "John /Smith/" → "John Smith"; extra whitespace collapsed.
  return nameValue.replace(/\//g, " ").replace(/\s+/g, " ").trim();
}

function extractEvent(record: GedcomNode, tag: string): GedcomEvent | null {
  const event = child(record, tag);
  if (!event) return null;
  const dateRaw = child(event, "DATE")?.value ?? null;
  const place = child(event, "PLAC")?.value ?? null;
  if (!dateRaw && !place) return null;
  return { dateRaw, date: dateRaw ? parseGedcomDate(dateRaw) : null, place };
}

function extractNotes(record: GedcomNode, noteRecords: Map<string, string>): string[] {
  const notes: string[] = [];
  for (const noteNode of record.children.filter((c) => c.tag === "NOTE")) {
    const value = noteNode.value ?? "";
    if (/^@[^@]+@$/.test(value)) {
      const resolved = noteRecords.get(value);
      if (resolved) notes.push(resolved);
    } else if (value.trim()) {
      notes.push(value);
    }
  }
  return notes;
}

/** Parse a GEDCOM file into individuals, families, and preserved raw records (PRD §14.2). */
export function parseGedcom(text: string): ParsedGedcom {
  const warnings: string[] = [];
  const roots = buildNodeTree(text, warnings);
  for (const root of roots) foldContinuations(root);

  const noteRecords = new Map<string, string>();
  for (const root of roots) {
    if (root.tag === "NOTE" && root.xref && root.value) {
      noteRecords.set(root.xref, root.value);
    }
  }

  const individuals: GedcomIndividual[] = [];
  const families: GedcomFamily[] = [];
  let header: GedcomNode | null = null;

  for (const root of roots) {
    if (root.tag === "HEAD") {
      header = root;
    } else if (root.tag === "INDI" && root.xref) {
      const names = childValues(root, "NAME").map(cleanName).filter(Boolean);
      const sex = child(root, "SEX")?.value?.trim().toUpperCase();
      individuals.push({
        xref: root.xref,
        fullName: names[0] ?? "Unknown",
        alternateNames: names.slice(1),
        gender: sex === "M" ? "male" : sex === "F" ? "female" : "unknown",
        birth: extractEvent(root, "BIRT"),
        death: extractEvent(root, "DEAT"),
        notes: extractNotes(root, noteRecords),
        childInFamilies: root.children
          .filter((c) => c.tag === "FAMC" && c.value)
          .map((famc) => ({
            famXref: famc.value!,
            pedigree: child(famc, "PEDI")?.value?.trim().toLowerCase() ?? null,
          })),
        raw: root,
      });
    } else if (root.tag === "FAM" && root.xref) {
      families.push({
        xref: root.xref,
        husbandXref: child(root, "HUSB")?.value ?? null,
        wifeXref: child(root, "WIFE")?.value ?? null,
        childXrefs: childValues(root, "CHIL"),
        married: child(root, "MARR") !== undefined,
        divorced: child(root, "DIV") !== undefined,
        raw: root,
      });
    }
  }

  const knownXrefs = new Set(individuals.map((i) => i.xref));
  for (const family of families) {
    for (const ref of [family.husbandXref, family.wifeXref, ...family.childXrefs]) {
      if (ref && !knownXrefs.has(ref)) {
        warnings.push(`Family ${family.xref} references missing individual ${ref}`);
      }
    }
  }
  if (individuals.length === 0) {
    warnings.push("No individuals found — is this a GEDCOM file?");
  }

  return { individuals, families, header, warnings };
}
