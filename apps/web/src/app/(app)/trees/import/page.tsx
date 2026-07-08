import { canCreateTrees, getSessionUser } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { getAccessibleTrees } from "@/lib/trees";

import { importGedcomAction } from "./actions";

export default async function ImportGedcomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [accessible, mayCreate] = await Promise.all([
    getAccessibleTrees(user),
    canCreateTrees(user),
  ]);
  // Importing into an archive requires admin on it (PRD §14.3 amended).
  const adminArchives = accessible.filter((tree) => tree.role === "admin");
  if (!mayCreate && adminArchives.length === 0) redirect("/trees");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Import a GEDCOM file</h1>
        <p className="mb-4 text-sm text-archive-700/80">
          Import into an existing archive to combine research — the file&apos;s people join the
          shared graph and likely duplicates are flagged for merge review. Or create a new, separate
          archive. Media referenced by the file is not imported.
        </p>
        <FormError message={error} />
        <form action={importGedcomAction} className="mt-4 space-y-4">
          <Field label="GEDCOM file (.ged, max 10 MB)">
            <input name="file" type="file" accept=".ged" required className={inputClass} />
          </Field>
          <Field label="Import into">
            <select
              name="target"
              className={inputClass}
              defaultValue={adminArchives[0]?.id ?? "new"}
            >
              {adminArchives.map((tree) => (
                <option key={tree.id} value={tree.id}>
                  {tree.name} (existing archive)
                </option>
              ))}
              {mayCreate && <option value="new">New archive…</option>}
            </select>
          </Field>
          <Field label="New archive name (only used for a new archive)">
            <input name="treeName" maxLength={200} className={inputClass} />
          </Field>
          <button type="submit" className={`${buttonClass} w-full`}>
            Import
          </button>
        </form>
      </Card>
    </div>
  );
}
