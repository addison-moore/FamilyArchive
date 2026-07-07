import { requireTreeRole } from "@familyarchive/auth";
import { treeRoleAtLeast } from "@familyarchive/shared";
import Link from "next/link";

import { buttonClass, Card, inputClass, subtleButtonClass } from "@/components/form";
import { PersonAvatar, personLifespan, PersonSummary } from "@/components/person-summary";
import { getPerson, getRelationshipGraph, listPeople } from "@/lib/people";

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ q?: string; selected?: string }>;
}) {
  const { treeId } = await params;
  const { role } = await requireTreeRole(treeId, "viewer");
  const { q, selected } = await searchParams;

  const peopleList = await listPeople(treeId, q);
  const selectedPerson = selected ? await getPerson(treeId, selected) : null;
  const selectedGraph = selectedPerson
    ? await getRelationshipGraph(treeId, selectedPerson.id)
    : null;

  const canEdit = treeRoleAtLeast(role, "editor");

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">People</h1>
          <form method="GET" className="ml-auto flex items-center gap-2">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search names…"
              className={`${inputClass} w-56`}
            />
            <button type="submit" className={subtleButtonClass}>
              Search
            </button>
          </form>
          {canEdit && (
            <Link href={`/trees/${treeId}/people/new`} className={`${buttonClass} no-underline`}>
              Add person
            </Link>
          )}
        </div>

        {peopleList.length === 0 ? (
          <Card>
            <p className="text-sm text-archive-700">
              {q
                ? `No people match “${q}”.`
                : canEdit
                  ? "No people yet — add the first family member."
                  : "No people in this tree yet."}
            </p>
          </Card>
        ) : (
          <ul className="divide-y divide-archive-100 rounded-xl border border-archive-100 bg-white shadow-sm">
            {peopleList.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/trees/${treeId}/people?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    selected: person.id,
                  })}`}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-archive-50 ${
                    person.id === selectedPerson?.id ? "bg-archive-100/50" : ""
                  }`}
                >
                  <PersonAvatar name={person.fullName} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{person.fullName}</div>
                    {personLifespan(person) && (
                      <div className="text-sm text-archive-700/70">{personLifespan(person)}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-full lg:w-96 lg:shrink-0">
        {selectedPerson && selectedGraph ? (
          <PersonSummary
            treeId={treeId}
            person={selectedPerson}
            graph={selectedGraph}
            role={role}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-archive-100 p-5 text-sm text-archive-700/60">
            Select a person to see a summary.
          </div>
        )}
      </div>
    </div>
  );
}
