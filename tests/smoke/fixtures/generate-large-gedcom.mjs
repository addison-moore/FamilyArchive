/**
 * Regenerates large-family.ged: a fully fictional (PRD §1.5) ~600-person
 * family around hub "Cornelius Hartleigh" — a complete 6-generation ancestor
 * pedigree above him and 5 generations of descendants (3 children per couple)
 * below — used to exercise auto-collapse and branch expansion on the tree
 * canvas at imported-tree scale.
 *
 * Deterministic by construction (no randomness): run `node
 * generate-large-gedcom.mjs` from this directory and the output is
 * byte-identical every time.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GIVEN_M = [
  "Alaric",
  "Bertram",
  "Caspian",
  "Dorian",
  "Edmund",
  "Florian",
  "Gideon",
  "Horatio",
  "Ignatius",
  "Jasper",
  "Leopold",
  "Mortimer",
  "Nathaniel",
  "Osric",
  "Percival",
  "Quentin",
  "Rutherford",
  "Silas",
  "Thaddeus",
  "Ulric",
];
const GIVEN_F = [
  "Araminta",
  "Beatrix",
  "Celestine",
  "Delphine",
  "Eulalia",
  "Fenella",
  "Gwendolyn",
  "Henrietta",
  "Isadora",
  "Josephine",
  "Lavinia",
  "Millicent",
  "Nerissa",
  "Ophelia",
  "Petronella",
  "Rosalind",
  "Seraphina",
  "Theodora",
  "Verity",
  "Winifred",
];
const SURNAMES = [
  "Hartleigh",
  "Suttonwood",
  "Fenwicke",
  "Ashgrove",
  "Birchwhistle",
  "Cloverfield",
  "Duskwater",
  "Elderglen",
  "Foxhollow",
  "Grimsbury",
  "Hollowbrook",
  "Ivorydale",
  "Juniperwell",
  "Kestrelmoor",
  "Larkspur",
  "Mistleford",
  "Oakhurst",
  "Quillingham",
  "Thornberry",
  "Wrenfield",
];

const ANCESTOR_GENERATIONS = 6; // full pedigree: 2+4+…+64 = 126 ancestors
const DESCENDANT_GENERATIONS = 5; // 3 children per couple: 3+9+27+81+243
const CHILDREN_PER_COUPLE = 3;
const HUB_BIRTH_YEAR = 1930;
const YEARS_PER_GENERATION = 27;

let nextId = 0;
const individuals = [];
const families = [];

/** generation: ancestors < 0 (like the app). Returns the xref. */
function person(sex, generation, surname, givenOverride) {
  nextId += 1;
  const given =
    givenOverride ??
    (sex === "M" ? GIVEN_M[nextId % GIVEN_M.length] : GIVEN_F[nextId % GIVEN_F.length]);
  const birthYear = HUB_BIRTH_YEAR - generation * YEARS_PER_GENERATION + (nextId % 5);
  const xref = `@I${nextId}@`;
  individuals.push({ xref, given, surname, sex, birthYear });
  return xref;
}

function family(husband, wife, children) {
  families.push({ xref: `@F${families.length + 1}@`, husband, wife, children });
}

const hub = person("M", 0, "Hartleigh", "Cornelius");

// Ancestors: complete pedigree. buildPedigree(child, gen) creates the child's
// parents at `gen`, links them, and recurses upward.
function buildPedigree(childXref, childSurname, generation) {
  if (generation < -ANCESTOR_GENERATIONS) return;
  const father = person("M", generation, childSurname);
  const motherSurname = SURNAMES[(nextId + 7) % SURNAMES.length];
  const mother = person("F", generation, motherSurname);
  family(father, mother, [childXref]);
  buildPedigree(father, childSurname, generation - 1);
  buildPedigree(mother, motherSurname, generation - 1);
}
buildPedigree(hub, "Hartleigh", -1);

// Descendants: hub + spouse, then 3 children per couple, each child marrying
// and continuing until DESCENDANT_GENERATIONS.
const hubSpouse = person("F", 0, "Suttonwood");
function buildDescendants(parentXref, parentSex, parentSurname, generation) {
  const spouseSex = parentSex === "M" ? "F" : "M";
  const spouseSurname = SURNAMES[(nextId + 3) % SURNAMES.length];
  const spouse = generation === 1 ? hubSpouse : person(spouseSex, generation - 1, spouseSurname);
  const childSurname = parentSex === "M" ? parentSurname : spouseSurname;
  const children = [];
  for (let i = 0; i < CHILDREN_PER_COUPLE; i++) {
    children.push(person(i % 2 === 0 ? "F" : "M", generation, childSurname));
  }
  const [husband, wife] = parentSex === "M" ? [parentXref, spouse] : [spouse, parentXref];
  family(husband, wife, children);
  if (generation < DESCENDANT_GENERATIONS) {
    for (const child of children) {
      const childRecord = individuals.find((p) => p.xref === child);
      buildDescendants(child, childRecord.sex, childSurname, generation + 1);
    }
  }
}
buildDescendants(hub, "M", "Hartleigh", 1);

const lines = [
  "0 HEAD",
  "1 SOUR FamilyArchive-Smoke",
  "1 GEDC",
  "2 VERS 5.5.1",
  "2 FORM LINEAGE-LINKED",
  "1 CHAR UTF-8",
];
for (const p of individuals) {
  lines.push(`0 ${p.xref} INDI`);
  lines.push(`1 NAME ${p.given} /${p.surname}/`);
  lines.push(`1 SEX ${p.sex}`);
  lines.push("1 BIRT");
  lines.push(`2 DATE ${p.birthYear}`);
}
for (const f of families) {
  lines.push(`0 ${f.xref} FAM`);
  lines.push(`1 HUSB ${f.husband}`);
  lines.push(`1 WIFE ${f.wife}`);
  for (const child of f.children) lines.push(`1 CHIL ${child}`);
  lines.push("1 MARR");
}
lines.push("0 TRLR");

const outPath = join(dirname(fileURLToPath(import.meta.url)), "large-family.ged");
writeFileSync(outPath, lines.join("\n") + "\n");
console.log(`Wrote ${outPath}: ${individuals.length} people, ${families.length} families`);
