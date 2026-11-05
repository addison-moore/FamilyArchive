import { requireTreeRole } from "@familyarchive/auth";
import { getDb, tags } from "@familyarchive/db";
import {
  DEFAULT_PAGE_SIZE,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPES,
  pageCount,
  parsePageSize,
  resolvePageNumber,
  treeRoleAtLeast,
  UPLOAD_MIME_TYPES,
} from "@familyarchive/shared";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { setMediaPageSizeAction } from "./actions";

import { Card, inputClass, subtleButtonClass } from "@/components/form";
import { ListPager } from "@/components/list-pager";
import { MediaThumb } from "@/components/media-thumb";
import { MediaUpload } from "@/components/media-upload";
import { PersonPicker } from "@/components/person-picker";
import { QUOTA_FULL_ADMIN_MESSAGE, QUOTA_FULL_MESSAGE, quotaState } from "@/lib/quota";
import { ScopeToggle } from "@/components/scope-toggle";
import { TrashedNotice } from "@/components/trashed-notice";
import { Alert, PageHeader, SegmentedLinks } from "@/components/ui";
import { resolveView } from "@/lib/branch";
import { countMedia, listMedia, thumbUrls } from "@/lib/media";
import { getPersonChoice } from "@/lib/people";
import { trashUrl } from "@/lib/trash";

/** Media library grid: all/my-uploads, type, tag, person filters. */
export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{
    type?: string;
    tag?: string;
    person?: string;
    mine?: string;
    scope?: string;
    collection?: string;
    page?: string;
    size?: string;
    trashed?: string;
  }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const {
    type,
    tag,
    person,
    mine,
    scope: scopeParam,
    collection,
    page: pageParam,
    size: sizeParam,
    trashed,
  } = await searchParams;

  const view = await resolveView(user?.id ?? null, treeId, scopeParam);
  // Branch scope is part of the query, not a post-filter: applied afterwards it
  // would interact with paging to produce short pages.
  const filters = {
    type,
    tagId: tag,
    personId: person,
    uploaderId: mine && user ? user.id : undefined,
    collectionId: collection,
    branchIds: view.branchIds,
  };

  const size = parsePageSize(sizeParam) ?? DEFAULT_PAGE_SIZE;
  const total = await countMedia(treeId, filters);
  const totalPages = pageCount(total, size);
  const page = resolvePageNumber(pageParam, totalPages);

  // Previously the grid loaded every media row in the archive, then fanned out
  // two more unbounded id lookups over the result.
  const [mediaList, treeTags, filteredPerson] = await Promise.all([
    listMedia(treeId, filters, { limit: size, offset: (page - 1) * size }),
    getDb().select().from(tags).where(eq(tags.treeId, treeId)).orderBy(asc(tags.name)),
    person ? getPersonChoice(treeId, person) : null,
  ]);

  const thumbs = await thumbUrls(
    treeId,
    mediaList.map((m) => m.id),
  );
  const canUpload = treeRoleAtLeast(role, "contributor");
  const canOpenTrash = treeRoleAtLeast(role, "editor");
  const canEmptyTrash = treeRoleAtLeast(role, "admin");
  const accept = Object.keys(UPLOAD_MIME_TYPES).join(",");
  const storage = canUpload ? await quotaState() : null;
  const storagePercent = storage?.percent ?? 0;
  const showUpload = canUpload && storagePercent < 100;

  const viewQuery = (mineValue: boolean) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (tag) params.set("tag", tag);
    if (person) params.set("person", person);
    if (mineValue) params.set("mine", "1");
    if (view.scope === "all") params.set("scope", "all");
    const query = params.toString();
    return `/trees/${treeId}/media${query ? `?${query}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Media">
        {showUpload && <MediaUpload treeId={treeId} accept={accept} />}
        {canOpenTrash && (
          // The upload button pushes itself to the end of the row. Without it, this has to.
          <Link
            href={trashUrl(treeId, "media")}
            className={`${subtleButtonClass} no-underline ${showUpload ? "" : "ml-auto"}`}
          >
            Trash
          </Link>
        )}
      </PageHeader>

      {trashed && canOpenTrash && <TrashedNotice treeId={treeId} kind="media" id={trashed} />}

      {storagePercent >= 100 ? (
        <Alert tone="danger" className="mb-4">
          {canEmptyTrash ? QUOTA_FULL_ADMIN_MESSAGE : QUOTA_FULL_MESSAGE}
          {canEmptyTrash && (
            <>
              {" "}
              <Link href={trashUrl(treeId, "media")} className="underline">
                Open Trash
              </Link>
            </>
          )}
        </Alert>
      ) : (
        storagePercent >= 90 && (
          <Alert tone="warn" className="mb-4">
            Storage is almost full ({storagePercent}% used).
          </Alert>
        )
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {user && (
          <SegmentedLinks
            label="Whose uploads to show"
            items={[
              { href: viewQuery(false), label: "All media", active: !mine },
              { href: viewQuery(true), label: "My uploads", active: Boolean(mine) },
            ]}
          />
        )}
        {user && (
          <ScopeToggle
            basePath={`/trees/${treeId}/media`}
            scope={view.scope}
            params={{ type, tag, person, mine }}
            anchorName={view.anchorName}
          />
        )}
        <form
          method="GET"
          className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center xl:ml-auto"
        >
          {mine && <input type="hidden" name="mine" value="1" />}
          {view.scope === "all" && <input type="hidden" name="scope" value="all" />}
          <select name="type" defaultValue={type ?? ""} className={`${inputClass} sm:w-auto`}>
            <option value="">All types</option>
            {MEDIA_TYPES.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {MEDIA_TYPE_LABELS[mediaType]}
              </option>
            ))}
          </select>
          <select
            name="tag"
            defaultValue={tag ?? ""}
            className={`${inputClass} sm:w-auto sm:max-w-56`}
          >
            <option value="">All tags</option>
            {treeTags.map((treeTag) => (
              <option key={treeTag.id} value={treeTag.id}>
                {treeTag.name}
              </option>
            ))}
          </select>
          <PersonPicker
            // A new filter in the URL means a new starting point, not an edit of this one.
            key={person ?? ""}
            treeId={treeId}
            name="person"
            ariaLabel="Filter by person"
            placeholder="Anyone"
            initial={filteredPerson}
            className="sm:w-72"
          />
          <button type="submit" className={subtleButtonClass}>
            Filter
          </button>
        </form>
      </div>

      {mediaList.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            {canUpload
              ? "No media yet — upload the first photos, videos, or documents."
              : "No media in this archive yet."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {mediaList.map((media) => (
            <MediaThumb
              key={media.id}
              treeId={treeId}
              media={media}
              thumbUrl={thumbs.get(media.id)}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <ListPager
          basePath={`/trees/${treeId}/media`}
          params={{
            type,
            tag,
            person,
            mine,
            scope: view.scope === "all" ? "all" : undefined,
            collection,
            ...(sizeParam ? { size: String(size) } : {}),
          }}
          page={page}
          totalPages={totalPages}
          shown={mediaList.length}
          total={total}
          size={size}
          label="items"
          sizeAction={setMediaPageSizeAction}
          actionFields={{ treeId }}
        />
      )}
    </div>
  );
}
