import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { notFound } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";

import { createCollectionAction } from "../actions";

export default async function NewCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId } = await params;
  try {
    await requireTreeRole(treeId, "editor");
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-4 text-xl font-semibold">New collection</h1>
        <FormError message={error} />
        <form action={createCollectionAction} className="mt-4 space-y-4">
          <input type="hidden" name="treeId" value={treeId} />
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={200}
              placeholder="e.g. The Bristol Years"
              className={inputClass}
            />
          </Field>
          <Field label="Description (optional)">
            <textarea name="description" rows={3} maxLength={5000} className={inputClass} />
          </Field>
          <div className="flex gap-3">
            <Field label="From year (optional)">
              <input
                name="startYear"
                type="number"
                min={1}
                max={9999}
                className={`${inputClass} w-28`}
              />
            </Field>
            <Field label="To year (optional)">
              <input
                name="endYear"
                type="number"
                min={1}
                max={9999}
                className={`${inputClass} w-28`}
              />
            </Field>
          </div>
          <button type="submit" className={`${buttonClass} w-full`}>
            Create collection
          </button>
        </form>
      </Card>
    </div>
  );
}
