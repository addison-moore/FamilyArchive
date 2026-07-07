import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { notFound } from "next/navigation";

import { buttonClass, Card, FormError } from "@/components/form";
import { PersonFormFields } from "@/components/person-form-fields";

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
      <Card>
        <h1 className="mb-4 text-xl font-semibold">Add a person</h1>
        <FormError message={error} />
        <form action={createPersonAction} className="mt-4 space-y-4">
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
