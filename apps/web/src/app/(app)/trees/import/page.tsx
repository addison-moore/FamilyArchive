import { AppHeader, PageBody } from "@/components/app-header";
import { canCreateTrees, getSessionUser } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { PageHeader } from "@/components/ui";
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
  // Importing into an archive requires admin on it.
  const adminArchives = accessible.filter((tree) => tree.role === "admin");
  if (!mayCreate && adminArchives.length === 0) redirect("/trees");
  const { error } = await searchParams;

  return (
    <>
      <AppHeader />
      <PageBody>
        <div className="mx-auto max-w-md">
          <PageHeader
            title="Import a GEDCOM file"
            description="Import into an existing archive to combine research — the file's people join the shared graph and likely duplicates are flagged for merge review. Or create a new, separate archive. Media referenced by the file is not imported."
          />
          <Card>
            <FormError message={error} className="mb-4" />
            <form action={importGedcomAction} className="space-y-4">
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
      </PageBody>
    </>
  );
}
