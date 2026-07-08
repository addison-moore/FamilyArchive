import { requireTreeRole } from "@familyarchive/auth";
import { getDb, tags, users, treeMemberships } from "@familyarchive/db";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@familyarchive/shared";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { buttonClass, Card, inputClass } from "@/components/form";
import { MediaThumb } from "@/components/media-thumb";
import { PersonAvatar, personLifespan } from "@/components/person-summary";
import { ScopeToggle } from "@/components/scope-toggle";
import { resolveView } from "@/lib/branch";
import { thumbUrls } from "@/lib/media";
import { listPeople } from "@/lib/people";
import { searchArchive, type SearchResults } from "@/lib/search";

/** Archive search (PRD §19): grouped results, filters, branch scope. */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    tag?: string;
    person?: string;
    uploader?: string;
    year?: string;
    scope?: string;
  }>;
}) {
  const { treeId } = await params;
  const { user } = await requireTreeRole(treeId, "viewer");
  const { q, type, tag, person, uploader, year, scope: scopeParam } = await searchParams;
  const query = q?.trim() ?? "";

  const db = getDb();
  const [view, treeTags, peopleList, uploaders] = await Promise.all([
    resolveView(user?.id ?? null, treeId, scopeParam),
    db.select().from(tags).where(eq(tags.treeId, treeId)).orderBy(asc(tags.name)),
    listPeople(treeId),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(treeMemberships)
      .innerJoin(users, eq(treeMemberships.userId, users.id))
      .where(eq(treeMemberships.treeId, treeId)),
  ]);

  const yearNumber = year && /^\d{1,4}$/.test(year) ? Number(year) : undefined;
  let results: SearchResults | null = null;
  if (query.length >= 2) {
    results = await searchArchive(
      treeId,
      query,
      {
        mediaType: type || undefined,
        tagId: tag || undefined,
        personId: person || undefined,
        uploaderId: uploader || undefined,
        year: yearNumber,
      },
      view.branchIds,
    );
  }
  const mediaThumbs = results
    ? await thumbUrls(
        treeId,
        results.media.map((m) => m.id),
      )
    : new Map<string, string>();
  const total = results
    ? results.people.length +
      results.media.length +
      results.collections.length +
      results.places.length
    : 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Search</h1>
        {user && (
          <ScopeToggle
            basePath={`/trees/${treeId}/search`}
            scope={view.scope}
            params={{ q: query, type, tag, person, uploader, year }}
            anchorName={view.anchorName}
          />
        )}
      </div>

      <form method="GET" className="mb-6 space-y-3">
        {view.scope === "all" && <input type="hidden" name="scope" value="all" />}
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            required
            minLength={2}
            placeholder="Search names, places, stories, documents…"
            className={`${inputClass} max-w-xl`}
          />
          <button type="submit" className={buttonClass}>
            Search
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select name="type" defaultValue={type ?? ""} className={`${inputClass} w-auto`}>
            <option value="">Any media type</option>
            {MEDIA_TYPES.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {MEDIA_TYPE_LABELS[mediaType]}
              </option>
            ))}
          </select>
          <select name="tag" defaultValue={tag ?? ""} className={`${inputClass} w-auto`}>
            <option value="">Any tag</option>
            {treeTags.map((treeTag) => (
              <option key={treeTag.id} value={treeTag.id}>
                {treeTag.name}
              </option>
            ))}
          </select>
          <select name="person" defaultValue={person ?? ""} className={`${inputClass} w-auto`}>
            <option value="">Anyone</option>
            {peopleList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          <select name="uploader" defaultValue={uploader ?? ""} className={`${inputClass} w-auto`}>
            <option value="">Any uploader</option>
            {uploaders.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
          <input
            name="year"
            type="number"
            min={1}
            max={9999}
            defaultValue={year ?? ""}
            placeholder="Year"
            className={`${inputClass} w-24`}
          />
        </div>
      </form>

      {!results ? (
        <Card>
          <p className="text-sm text-archive-700/70">
            Search across people, biographies, notes, media, tags, OCR&apos;d documents,
            transcriptions, collections, and places. Enter at least two characters.
          </p>
        </Card>
      ) : total === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            No results for “{query}”
            {view.scope === "branch" ? " in your branch — try the Everyone scope." : "."}
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {results.people.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">People ({results.people.length})</h2>
              <ul className="divide-y divide-archive-100 rounded-xl border border-archive-100 bg-white shadow-sm">
                {results.people.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/trees/${treeId}/people/${p.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-archive-50"
                    >
                      <PersonAvatar name={p.fullName} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.fullName}</div>
                        {personLifespan(p) && (
                          <div className="text-sm text-archive-700/70">{personLifespan(p)}</div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.media.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Media ({results.media.length})</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {results.media.map((m) => (
                  <MediaThumb
                    key={m.id}
                    treeId={treeId}
                    media={m}
                    thumbUrl={mediaThumbs.get(m.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {results.collections.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">
                Collections ({results.collections.length})
              </h2>
              <ul className="divide-y divide-archive-100 rounded-xl border border-archive-100 bg-white shadow-sm">
                {results.collections.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/trees/${treeId}/collections/${c.id}`}
                      className="block px-4 py-3 hover:bg-archive-50"
                    >
                      <span className="font-medium">🗂 {c.name}</span>
                      {c.description && (
                        <span className="ml-2 text-sm text-archive-700/70">{c.description}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.places.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Places ({results.places.length})</h2>
              <ul className="flex flex-wrap gap-2">
                {results.places.map((place) => (
                  <li key={place.id}>
                    <span className="rounded-full bg-archive-100 px-3 py-1.5 text-sm">
                      📍 {place.displayName}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
