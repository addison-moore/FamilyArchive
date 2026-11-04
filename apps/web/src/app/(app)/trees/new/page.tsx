import { AppHeader, PageBody } from "@/components/app-header";
import { canCreateTrees, getSessionUser } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { PageHeader } from "@/components/ui";

import { createTreeAction } from "./actions";

export default async function NewTreePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await canCreateTrees(user))) redirect("/trees");
  const { error } = await searchParams;

  return (
    <>
      <AppHeader />
      <PageBody>
        <div className="mx-auto max-w-md">
          <PageHeader title="Create a family tree" />
          <Card>
            <FormError message={error} className="mb-4" />
            <form action={createTreeAction} className="space-y-4">
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
      </PageBody>
    </>
  );
}
