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
import { Badge, PageHeader } from "@/components/ui";
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
      <PageHeader title={`Edit ${person.fullName}`} />
      <Card>
        <FormError message={error} className="mb-4" />
        <form action={updatePersonAction} className="space-y-4">
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
                    <Badge className="ml-2">{PERSON_NAME_KIND_LABELS[name.kind]}</Badge>
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
          <Field label="Name" className="min-w-48 flex-1">
            <input name="name" required maxLength={300} className={inputClass} />
          </Field>
          <Field label="Kind" className="w-full sm:w-44">
            <select name="kind" className={inputClass}>
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
        <p className="mb-4 text-sm text-archive-700">
          {person.fullName} will disappear from the tree, lists and search. Restoring them from
          Trash brings back their relationships and photo tags. Their photos stay in the library
          either way.
        </p>
        <form action={deletePersonAction}>
          <input type="hidden" name="treeId" value={treeId} />
          <input type="hidden" name="personId" value={personId} />
          <button type="submit" className={dangerButtonClass}>
            Move {person.fullName} to Trash
          </button>
        </form>
      </Card>
    </div>
  );
}
