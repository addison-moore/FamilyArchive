"use server";

import {
  AuthorizationError,
  canCreateTrees,
  requireMemberRole,
  requireUser,
} from "@familyarchive/auth";
import { decodeGedcom, UnsupportedGedcomEncodingError } from "@familyarchive/gedcom";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { GedcomImportError, importGedcom } from "@/lib/gedcom-import";

const MAX_GEDCOM_BYTES = 10 * 1024 * 1024;

export async function importGedcomAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const target = String(formData.get("target") ?? "new");

  // Permission: archive admin to import into it,
  // archive-creation rights for a new one.
  if (target === "new") {
    if (!(await canCreateTrees(user))) {
      throw new AuthorizationError("Creating an archive requires owner or admin access");
    }
  } else {
    await requireMemberRole(target, "admin");
  }

  const fail = (message: string) => redirect(`/trees/import?error=${encodeURIComponent(message)}`);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a GEDCOM file");
  if (file.size > MAX_GEDCOM_BYTES) return fail("File is larger than 10 MB");
  if (!/\.ged$/i.test(file.name)) return fail("File must have a .ged extension");
  const treeName = String(formData.get("treeName") ?? "").trim() || undefined;

  // Decode from the bytes, honouring the header's `1 CHAR` declaration:
  // `file.text()` always decodes UTF-8 non-fatally, so an ANSEL or ANSI export
  // would import with every accented name replaced by U+FFFD, unrecoverably.
  let text;
  try {
    text = decodeGedcom(new Uint8Array(await file.arrayBuffer())).text;
  } catch (error) {
    if (error instanceof UnsupportedGedcomEncodingError) return fail(error.message);
    throw error;
  }

  let result;
  try {
    result = await importGedcom(user, file.name, text, {
      treeName,
      targetTreeId: target === "new" ? undefined : target,
    });
  } catch (error) {
    if (error instanceof GedcomImportError) return fail(error.message);
    // Not shown: a driver error can quote the failed statement and its values, and
    // at that length it would not fit in the redirect's URL either.
    console.error("GEDCOM import failed:", error);
    return fail("The import failed and nothing was saved. Check the file and try again.");
  }
  await recordAudit({
    treeId: result.treeId,
    actorId: user.id,
    action: "gedcom.imported",
    targetType: "source",
    targetId: result.sourceId,
    summary: `Imported ${result.peopleCount} people and ${result.relationshipCount} relationships from ${file.name}`,
  });

  const params = new URLSearchParams({
    imported: "1",
    people: String(result.peopleCount),
    rels: String(result.relationshipCount),
  });
  // Only the count rides in the URL; the messages themselves are persisted on
  // the import's source record. Previously they were collected and never shown
  // at all, so a partly-malformed file imported looking completely clean.
  if (result.warnings.length > 0) params.set("warn", String(result.warnings.length));
  redirect(`/trees/${result.treeId}?${params}`);
}
