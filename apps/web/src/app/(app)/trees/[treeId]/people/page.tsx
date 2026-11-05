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
import { PersonAvatar, PersonSummary } from "@/components/person-summary";
import { ScopeToggle } from "@/components/scope-toggle";
import { TrashedNotice } from "@/components/trashed-notice";
import { PageHeader } from "@/components/ui";
import { resolveView } from "@/lib/branch";
import { profilePhotoUrl } from "@/lib/media";
import {
  countPeople,
  getPerson,
  getRelationshipGraph,
  listPeoplePage,
  personLifespan,
} from "@/lib/people";
import { storedPeoplePageSize } from "@/lib/preferences";
import { trashUrl } from "@/lib/trash";

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
    trashed?: string;
  }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const {
    q,
    selected,
    scope: scopeParam,
    page: pageParam,
    size: sizeParam,
    trashed,
  } = await searchParams;

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
    <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="People"
          actions={
            canEdit && (
              <>
                <Link
                  href={`/trees/${treeId}/people/new`}
                  className={`${buttonClass} no-underline`}
                >
                  Add person
                </Link>
                <Link
                  href={trashUrl(treeId, "people")}
                  className={`${subtleButtonClass} no-underline`}
                >
                  Trash
                </Link>
              </>
            )
          }
        />
        {trashed && canEdit && <TrashedNotice treeId={treeId} kind="person" id={trashed} />}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {user && (
            <ScopeToggle
              basePath={`/trees/${treeId}/people`}
              scope={view.scope}
              params={{ ...listParams, selected }}
              anchorName={view.anchorName}
            />
          )}
          {view.branchIds && (
            <span className="text-xs text-archive-700">
              {total} of {allTotal} people
            </span>
          )}
          <form method="GET" className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            {view.scope === "all" && <input type="hidden" name="scope" value="all" />}
            {sizeInUrl && <input type="hidden" name="size" value={sizeInUrl} />}
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search names…"
              className={`${inputClass} min-w-0 flex-1 sm:w-56 sm:flex-none`}
            />
            <button type="submit" className={subtleButtonClass}>
              Search
            </button>
          </form>
        </div>

        {total === 0 ? (
          <Card>
            <p className="text-sm text-archive-700">
              {q
                ? `No people match “${q}”.`
                : canEdit
                  ? "No people yet — add the first family member."
                  : "No people in this archive yet."}
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
                        <div className="text-sm text-archive-700">{personLifespan(person)}</div>
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

      {/* Above the list on narrow screens, where below it would be out of sight of
          the row just tapped. With nobody selected there's nothing to show there. */}
      <div
        className={`w-full lg:order-none lg:block lg:w-96 lg:shrink-0 ${
          selectedPerson ? "order-first" : "hidden"
        }`}
      >
        {selectedPerson && selectedGraph ? (
          <PersonSummary
            treeId={treeId}
            person={selectedPerson}
            graph={selectedGraph}
            role={role}
            photoUrl={selectedPhotoUrl}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-archive-100 p-5 text-sm text-archive-700">
            Select a person to see a summary.
          </div>
        )}
      </div>
    </div>
  );
}
