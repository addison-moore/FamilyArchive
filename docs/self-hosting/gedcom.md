# GEDCOM Import and Export

FamilyArchive can import and export GEDCOM 5.5 / 5.5.1 files so your family data
is never locked in (PRD §5.5).

## Import

**My archives → Import GEDCOM.** Choose the destination:

- **An existing archive** (you must be an admin of it): the file's people and
  relationships join the archive's shared graph, the import is recorded as a
  [source](../concepts.md), and likely duplicates are flagged for
  **Compare & merge** review — the recommended way to combine overlapping
  research from several relatives.
- **A new archive** (requires archive-creation permission): a separate, isolated
  archive is created from the file.

What is imported:

| GEDCOM                       | FamilyArchive                                    |
| ---------------------------- | ------------------------------------------------ |
| `INDI` `NAME` (first)        | Person full name (surname slashes removed)       |
| Additional `NAME` lines      | Alternate names                                  |
| `SEX`                        | Gender (`M`/`F`; everything else → unknown)      |
| `BIRT`/`DEAT` `DATE`         | Date parts; `ABT`/`EST`/`CAL` → approximate;     |
|                              | `BEF`/`AFT`/`BET` → first year, approximate      |
| `BIRT`/`DEAT` `PLAC`         | Place records (raw value preserved)              |
| `NOTE` (inline or record)    | Person notes                                     |
| `FAM` `HUSB`/`WIFE` + `CHIL` | Parent relationships (biological by default)     |
| Child `FAMC` `PEDI adopted`  | Adoptive parent relationship (`foster` → foster) |
| `FAM` with `MARR` / `DIV`    | Spouse / divorced-spouse relationship            |
| `FAM` without `MARR`         | Partner relationship                             |

Everything else — sources, events beyond birth/death, vendor extensions — is
**preserved verbatim** in each person's `metadata.gedcom.raw` (and the file
header on the tree record), so nothing is lost even though it isn't displayed.

Media files referenced by the GEDCOM are not imported (v1).

After import, review **possible duplicates** (linked from the success banner):
people with the same name and compatible birth years. FamilyArchive v1 warns but
does not merge.

## Export

**Tree settings → GEDCOM export**, or `GET /api/trees/<treeId>/gedcom` as any
member of the tree. The export contains people (names, gender, birth/death dates
and places, notes + biography as `NOTE`s), reconstructed `FAM` records with
`MARR`/`DIV` from relationship types, and `PEDI adopted`/`foster` for
adoptive/foster children. Media is not included.

Known limits (v1):

- Export regenerates from structured data; raw imported records are not
  re-emitted.
- GEDCOM 5.5.1 `HUSB`/`WIFE` roles are assigned by gender; for same-sex or
  unknown-gender couples the parents fill the two positions in order.
- Relationship dates (marriage/divorce dates) are not tracked in v1, so `MARR`
  is exported without a date.
- Surnames are inferred as the last word of the full name when exporting
  `NAME` lines.
