import { requireTreeRole } from "@familyarchive/auth";
import {
  pageCount,
  parsePageSize,
  resolvePageNumber,
  treeRoleAtLeast,
} from "@familyarchive/shared";
import Link from "next/link";

import { buttonClass, Card, inputClass, subtleButtonClass } from "@/components/form";
import { ListPager } from "@/components/list-pager";
import { PersonAvatar, personLifespan, PersonSummary } from "@/components/person-summary";
import { ScopeToggle } from "@/components/scope-toggle";
import { resolveView } from "@/lib/branch";
import { profilePhotoUrl } from "@/lib/media";
import { countPeople, getPerson, getRelationshipGraph, listPeoplePage } from "@/lib/people";
import { storedPeoplePageSize } from "@/lib/preferences";

import { setPeoplePageSizeAction } from "./actions";

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{
    q?: string;
    selected?: string;
    scope?: string;
    page?: string;
    size?: string;
  }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const { q, selected, scope: scopeParam, page: pageParam, size: sizeParam } = await searchParams;

  const [view, storedSize] = await Promise.all([
    resolveView(user?.id ?? null, treeId, scopeParam),
    storedPeoplePageSize(user?.id ?? null, treeId),
  ]);
  // An explicit ?size= wins (it is how anonymous visitors hold a choice for the
  // visit); otherwise the saved preference decides.
  const sizeInUrl = parsePageSize(sizeParam);
  const size = sizeInUrl ?? storedSize;

  const filter = { query: q, ids: view.branchIds };
  const [total, allTotal] = await Promise.all([
    countPeople(treeId, filter),
    // Only needed for the "N of M" label the branch view shows.
    view.branchIds ? countPeople(treeId, { query: q }) : null,
  ]);

  const totalPages = pageCount(total, size);
  const page = resolvePageNumber(pageParam, totalPages);
  const [peopleList, selectedPerson] = await Promise.all([
    listPeoplePage(treeId, filter, { limit: size, offset: (page - 1) * size }),
    selected ? getPerson(treeId, selected) : null,
  ]);

  const [selectedGraph, selectedPhotoUrl] = selectedPerson
    ? await Promise.all([
        getRelationshipGraph(treeId, selectedPerson.id),
        profilePhotoUrl(treeId, selectedPerson.profileMediaId),
      ])
    : [null, null];

  const canEdit = treeRoleAtLeast(role, "editor");

  // Carried across list navigation. `size` only when the URL is the source of
  // truth for it, so a signed-in user's links stay clean.
  const listParams = {
    ...(q ? { q } : {}),
    ...(view.scope === "all" ? { scope: "all" } : {}),
    ...(sizeInUrl ? { size: String(sizeInUrl) } : {}),
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">People</h1>
          {user && (
            <ScopeToggle
              basePath={`/trees/${treeId}/people`}
              scope={view.scope}
              params={{ ...listParams, selected }}
              anchorName={view.anchorName}
            />
          )}
          {view.branchIds && (
            <span className="text-xs text-archive-700/70">
              {total} of {allTotal} people
            </span>
          )}
          <form method="GET" className="ml-auto flex items-center gap-2">
            {view.scope === "all" && <input type="hidden" name="scope" value="all" />}
            {sizeInUrl && <input type="hidden" name="size" value={sizeInUrl} />}
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

        {total === 0 ? (
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
          <>
            <ul className="divide-y divide-archive-100 rounded-xl border border-archive-100 bg-surface shadow-sm">
              {peopleList.map((person) => (
                <li key={person.id}>
                  <Link
                    href={`/trees/${treeId}/people?${new URLSearchParams({
                      ...listParams,
                      ...(page > 1 ? { page: String(page) } : {}),
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
            <ListPager
              basePath={`/trees/${treeId}/people`}
              params={{ ...listParams, ...(selected ? { selected } : {}) }}
              page={page}
              totalPages={totalPages}
              shown={peopleList.length}
              total={total}
              size={size}
              label="people"
              sizeAction={setPeoplePageSizeAction}
              actionFields={{ treeId }}
            />
          </>
        )}
      </div>

      <div className="w-full lg:w-96 lg:shrink-0">
        {selectedPerson && selectedGraph ? (
          <PersonSummary
            treeId={treeId}
            person={selectedPerson}
            graph={selectedGraph}
            role={role}
            photoUrl={selectedPhotoUrl}
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
