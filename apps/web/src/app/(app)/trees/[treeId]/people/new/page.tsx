import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { notFound } from "next/navigation";

import { buttonClass, Card, FormError } from "@/components/form";
import { PersonFormFields } from "@/components/person-form-fields";
import { PageHeader } from "@/components/ui";

import { createPersonAction } from "../actions";

export default async function NewPersonPage({
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
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a person" />
      <Card>
        <FormError message={error} className="mb-4" />
        <form action={createPersonAction} className="space-y-4">
          <input type="hidden" name="treeId" value={treeId} />
          <PersonFormFields />
          <button type="submit" className={buttonClass}>
            Add person
          </button>
        </form>
      </Card>
    </div>
  );
}
