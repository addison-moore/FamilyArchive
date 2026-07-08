import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { PERSON_NAME_KIND_LABELS, PERSON_NAME_KINDS } from "@familyarchive/shared";
import { notFound } from "next/navigation";

import {
  buttonClass,
  Card,
  dangerButtonClass,
  Field,
  FormError,
  inputClass,
  subtleButtonClass,
} from "@/components/form";
import { PersonFormFields } from "@/components/person-form-fields";
import { getPerson, getPersonNames, getPlaceName } from "@/lib/people";

import {
  addPersonNameAction,
  deletePersonAction,
  removePersonNameAction,
  updatePersonAction,
} from "../../actions";

export default async function EditPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string; personId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId, personId } = await params;
  try {
    await requireTreeRole(treeId, "editor");
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const { error } = await searchParams;

  const person = await getPerson(treeId, personId);
  if (!person) notFound();

  const [names, birthPlaceName, deathPlaceName] = await Promise.all([
    getPersonNames(personId),
    getPlaceName(person.birthPlaceId),
    getPlaceName(person.deathPlaceId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <h1 className="mb-4 text-xl font-semibold">Edit {person.fullName}</h1>
        <FormError message={error} />
        <form action={updatePersonAction} className="mt-4 space-y-4">
          <input type="hidden" name="treeId" value={treeId} />
          <input type="hidden" name="personId" value={personId} />
          <PersonFormFields
            person={person}
            birthPlaceName={birthPlaceName}
            deathPlaceName={deathPlaceName}
          />
          <button type="submit" className={buttonClass}>
            Save changes
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Alternate names</h2>
        {names.length > 0 && (
          <ul className="mb-4 divide-y divide-archive-100">
            {names.map((name) => (
              <li key={name.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  {name.name}
                  {name.kind && (
                    <span className="ml-2 rounded bg-archive-100 px-1.5 py-0.5 text-xs text-archive-700">
                      {PERSON_NAME_KIND_LABELS[name.kind]}
                    </span>
                  )}
                </span>
                <form action={removePersonNameAction}>
                  <input type="hidden" name="treeId" value={treeId} />
                  <input type="hidden" name="personId" value={personId} />
                  <input type="hidden" name="nameId" value={name.id} />
                  <button type="submit" className={dangerButtonClass}>
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addPersonNameAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="treeId" value={treeId} />
          <input type="hidden" name="personId" value={personId} />
          <Field label="Name">
            <input name="name" required maxLength={300} className={`${inputClass} w-64`} />
          </Field>
          <Field label="Kind">
            <select name="kind" className={`${inputClass} w-44`}>
              <option value="">—</option>
              {PERSON_NAME_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PERSON_NAME_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={subtleButtonClass}>
            Add name
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-danger">Delete person</h2>
        <p className="mb-4 text-sm text-archive-700/80">
          {person.fullName} will be hidden from the tree and lists. The record is kept (soft delete)
          and relationships to them stop being shown.
        </p>
        <form action={deletePersonAction}>
          <input type="hidden" name="treeId" value={treeId} />
          <input type="hidden" name="personId" value={personId} />
          <button type="submit" className={dangerButtonClass}>
            Delete {person.fullName}
          </button>
        </form>
      </Card>
    </div>
  );
}
