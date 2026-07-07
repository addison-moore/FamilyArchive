import { canCreateTrees, requireUser } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";

import { createTreeAction } from "./actions";

export default async function NewTreePage({
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
        <h1 className="mb-4 text-xl font-semibold">Create a family tree</h1>
        <FormError message={error} />
        <form action={createTreeAction} className="mt-4 space-y-4">
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={200}
              placeholder="e.g. The Hartwell Family"
              className={inputClass}
            />
          </Field>
          <Field label="Description (optional)">
            <textarea name="description" rows={3} maxLength={2000} className={inputClass} />
          </Field>
          <button type="submit" className={`${buttonClass} w-full`}>
            Create tree
          </button>
        </form>
      </Card>
    </div>
  );
}
