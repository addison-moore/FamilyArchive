"use server";

import {
  AuthorizationError,
  canCreateTrees,
  requireMemberRole,
  requireUser,
} from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { importGedcom } from "@/lib/gedcom-import";

const MAX_GEDCOM_BYTES = 10 * 1024 * 1024;

export async function importGedcomAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const target = String(formData.get("target") ?? "new");

  // Permission per PRD §14.3 (amended): archive admin to import into it,
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

  let result;
  try {
    result = await importGedcom(user, file.name, await file.text(), {
      treeName,
      targetTreeId: target === "new" ? undefined : target,
    });
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error; // Next redirects
    return fail(error instanceof Error ? error.message : "Import failed");
  }

  const params = new URLSearchParams({
    imported: "1",
    people: String(result.peopleCount),
    rels: String(result.relationshipCount),
  });
  redirect(`/trees/${result.treeId}?${params}`);
}
