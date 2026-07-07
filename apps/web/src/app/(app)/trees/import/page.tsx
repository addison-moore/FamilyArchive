import { canCreateTrees, requireUser } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";

import { importGedcomAction } from "./actions";

export default async function ImportGedcomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!(await canCreateTrees(user))) redirect("/trees");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-1 text-xl font-semibold">Import a GEDCOM file</h1>
        <p className="mb-4 text-sm text-archive-700/80">
          Importing creates a <strong>new tree</strong> with the file&apos;s people and
          relationships. Media referenced by the file is not imported. See{" "}
          <code>docs/self-hosting/gedcom.md</code> for details.
        </p>
        <FormError message={error} />
        <form action={importGedcomAction} className="mt-4 space-y-4">
          <Field label="GEDCOM file (.ged, max 10 MB)">
            <input name="file" type="file" accept=".ged" required className={inputClass} />
          </Field>
          <Field label="Tree name (optional — defaults to the file name)">
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
