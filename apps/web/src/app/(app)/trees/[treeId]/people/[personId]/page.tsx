import { requireTreeRole } from "@familyarchive/auth";
import {
  formatDateParts,
  GENDER_LABELS,
  PARENT_RELATIONSHIP_TYPES,
  PARTNER_RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  treeRoleAtLeast,
} from "@familyarchive/shared";
import type { RelationshipType } from "@familyarchive/shared";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  buttonClass,
  Card,
  Field,
  FormError,
  inputClass,
  subtleButtonClass,
} from "@/components/form";
import { PersonAvatar, personLifespan } from "@/components/person-summary";
import {
  getPerson,
  getPersonNames,
  getPlaceName,
  getRelationshipGraph,
  listPeople,
  type PersonRow,
  type RelatedPerson,
} from "@/lib/people";

import { addRelationshipAction, removeRelationshipAction } from "../actions";

function RelationGroup({
  title,
  treeId,
  personId,
  related,
  canEdit,
}: {
  title: string;
  treeId: string;
  personId: string;
  related: RelatedPerson[];
  canEdit: boolean;
}) {
  if (related.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-archive-700/80">{title}</h3>
      <ul className="space-y-2">
        {related.map((item) => (
          <li key={item.relationshipId} className="flex items-center gap-3">
            <PersonAvatar name={item.person.fullName} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/trees/${treeId}/people/${item.person.id}`}
                className="font-medium hover:text-accent-600"
              >
                {item.person.fullName}
              </Link>
              <div className="text-xs text-archive-700/70">
                {RELATIONSHIP_TYPE_LABELS[item.type]}
                {personLifespan(item.person) ? ` · ${personLifespan(item.person)}` : ""}
              </div>
            </div>
            {canEdit && (
              <form action={removeRelationshipAction}>
                <input type="hidden" name="treeId" value={treeId} />
                <input type="hidden" name="personId" value={personId} />
                <input type="hidden" name="relationshipId" value={item.relationshipId} />
                <button
                  type="submit"
                  className="text-xs text-archive-700/50 hover:text-red-700"
                  title="Remove relationship"
                >
                  remove
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddRelationshipForm({
  treeId,
  personId,
  direction,
  label,
  types,
  candidates,
}: {
  treeId: string;
  personId: string;
  direction: "parent" | "child" | "partner";
  label: string;
  types: readonly RelationshipType[];
  candidates: PersonRow[];
}) {
  return (
    <details className="rounded-md border border-archive-100 p-3">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      <form action={addRelationshipAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="treeId" value={treeId} />
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="direction" value={direction} />
        <Field label="Person">
          <select name="otherPersonId" required className={`${inputClass} w-56`}>
            <option value="">Select…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
                {personLifespan(candidate) ? ` (${personLifespan(candidate)})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select name="type" className={`${inputClass} w-44`}>
            {types.map((type) => (
              <option key={type} value={type}>
                {RELATIONSHIP_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input name="notes" maxLength={2000} className={`${inputClass} w-48`} />
        </Field>
        <button type="submit" className={subtleButtonClass}>
          Add
        </button>
      </form>
    </details>
  );
}

export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string; personId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId, personId } = await params;
  const { role } = await requireTreeRole(treeId, "viewer");
  const { error } = await searchParams;

  const person = await getPerson(treeId, personId);
  if (!person) notFound();

  const [graph, names, birthPlace, deathPlace, allPeople] = await Promise.all([
    getRelationshipGraph(treeId, personId),
    getPersonNames(personId),
    getPlaceName(person.birthPlaceId),
    getPlaceName(person.deathPlaceId),
    listPeople(treeId),
  ]);
  const candidates = allPeople.filter((p) => p.id !== personId);
  const canEdit = treeRoleAtLeast(role, "editor");

  const birthText = formatDateParts({
    year: person.birthYear,
    month: person.birthMonth,
    day: person.birthDay,
    approx: person.birthApprox,
  });
  const deathText = formatDateParts({
    year: person.deathYear,
    month: person.deathMonth,
    day: person.deathDay,
    approx: person.deathApprox,
  });

  const facts: { label: string; value: string }[] = [];
  if (birthText || birthPlace) {
    facts.push({ label: "Born", value: [birthText, birthPlace].filter(Boolean).join(" · ") });
  }
  if (deathText || deathPlace) {
    facts.push({ label: "Died", value: [deathText, deathPlace].filter(Boolean).join(" · ") });
  }
  if (person.gender !== "unknown") {
    facts.push({
      label: "Gender",
      value:
        person.gender === "custom"
          ? (person.genderCustom ?? "Custom")
          : GENDER_LABELS[person.gender],
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <FormError message={error} />

      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <PersonAvatar name={person.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{person.fullName}</h1>
            {names.length > 0 && (
              <p className="text-sm text-archive-700/80">
                {names
                  .map((n) => `${n.name}${n.kind ? ` (${n.kind.replace(/_/g, " ")})` : ""}`)
                  .join(" · ")}
              </p>
            )}
            {personLifespan(person) && (
              <p className="text-sm text-archive-700/80">{personLifespan(person)}</p>
            )}
          </div>
          {canEdit && (
            <Link
              href={`/trees/${treeId}/people/${personId}/edit`}
              className={`${buttonClass} no-underline`}
            >
              Edit
            </Link>
          )}
        </div>
        {facts.length > 0 && (
          <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="font-medium">{fact.label}</dt>
                <dd className="text-archive-700">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Media</h2>
        <p className="rounded-md bg-archive-100/50 px-3 py-2 text-sm text-archive-700/70">
          Photos, documents, and tagged media arrive with the media library (Milestone 6).
        </p>
      </Card>

      {person.biography && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Biography</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-archive-700">
            {person.biography}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Relationships</h2>
        <div className="space-y-5">
          <RelationGroup
            title="Parents"
            treeId={treeId}
            personId={personId}
            related={graph.parents}
            canEdit={canEdit}
          />
          <RelationGroup
            title="Partners"
            treeId={treeId}
            personId={personId}
            related={graph.partners}
            canEdit={canEdit}
          />
          <RelationGroup
            title="Children"
            treeId={treeId}
            personId={personId}
            related={graph.children}
            canEdit={canEdit}
          />
          {graph.siblings.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-archive-700/80">
                Siblings (inferred from shared parents)
              </h3>
              <ul className="space-y-2">
                {graph.siblings.map((sibling) => (
                  <li key={sibling.id} className="flex items-center gap-3">
                    <PersonAvatar name={sibling.fullName} />
                    <Link
                      href={`/trees/${treeId}/people/${sibling.id}`}
                      className="font-medium hover:text-accent-600"
                    >
                      {sibling.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {graph.parents.length + graph.partners.length + graph.children.length === 0 &&
            graph.siblings.length === 0 && (
              <p className="text-sm text-archive-700/70">No relationships yet.</p>
            )}
        </div>

        {canEdit && (
          <div className="mt-6 space-y-3">
            <AddRelationshipForm
              treeId={treeId}
              personId={personId}
              direction="parent"
              label="Add parent"
              types={PARENT_RELATIONSHIP_TYPES}
              candidates={candidates}
            />
            <AddRelationshipForm
              treeId={treeId}
              personId={personId}
              direction="partner"
              label="Add spouse / partner"
              types={PARTNER_RELATIONSHIP_TYPES}
              candidates={candidates}
            />
            <AddRelationshipForm
              treeId={treeId}
              personId={personId}
              direction="child"
              label="Add child"
              types={PARENT_RELATIONSHIP_TYPES}
              candidates={candidates}
            />
            {candidates.length === 0 && (
              <p className="text-xs text-archive-700/60">
                Add more people to the tree to connect them here.
              </p>
            )}
          </div>
        )}
      </Card>

      {person.notes && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Notes</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-archive-700">
            {person.notes}
          </p>
        </Card>
      )}
    </div>
  );
}
