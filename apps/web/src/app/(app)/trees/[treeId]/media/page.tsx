import { requireTreeRole } from "@familyarchive/auth";
import { getDb, tags } from "@familyarchive/db";
import {
  MEDIA_TYPE_LABELS,
  MEDIA_TYPES,
  treeRoleAtLeast,
  UPLOAD_MIME_TYPES,
} from "@familyarchive/shared";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { Card, inputClass, subtleButtonClass } from "@/components/form";
import { MediaThumb } from "@/components/media-thumb";
import { MediaUpload } from "@/components/media-upload";
import { ScopeToggle } from "@/components/scope-toggle";
import { resolveView } from "@/lib/branch";
import { listMedia, taggedPersonIdsByMedia, thumbUrls } from "@/lib/media";
import { listPeople } from "@/lib/people";

/** Media library grid (PRD §15.3, §29.3): all/my-uploads, type, tag, person filters. */
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
  }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const { type, tag, person, mine, scope: scopeParam } = await searchParams;

  const [view, allMedia, treeTags, peopleList] = await Promise.all([
    resolveView(user.id, treeId, scopeParam),
    listMedia(treeId, {
      type,
      tagId: tag,
      personId: person,
      uploaderId: mine ? user.id : undefined,
    }),
    getDb().select().from(tags).where(eq(tags.treeId, treeId)).orderBy(asc(tags.name)),
    listPeople(treeId),
  ]);

  // Branch scope (PRD §10.6): hide media tagged exclusively with out-of-branch
  // people; untagged media belongs to the whole archive and stays visible.
  let mediaList = allMedia;
  if (view.branchIds) {
    const taggedBy = await taggedPersonIdsByMedia(allMedia.map((m) => m.id));
    mediaList = allMedia.filter((m) => {
      const tagged = taggedBy.get(m.id);
      if (!tagged || tagged.length === 0) return true;
      return tagged.some((personId) => view.branchIds!.has(personId));
    });
  }

  const thumbs = await thumbUrls(
    treeId,
    mediaList.map((m) => m.id),
  );
  const canUpload = treeRoleAtLeast(role, "contributor");
  const accept = Object.keys(UPLOAD_MIME_TYPES).join(",");

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
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Media</h1>
        <div className="flex rounded-md border border-archive-100 bg-white p-0.5 text-sm">
          <Link
            href={viewQuery(false)}
            className={`rounded px-3 py-1.5 no-underline ${!mine ? "bg-archive-100 font-medium" : "text-archive-700 hover:bg-archive-50"}`}
          >
            All media
          </Link>
          <Link
            href={viewQuery(true)}
            className={`rounded px-3 py-1.5 no-underline ${mine ? "bg-archive-100 font-medium" : "text-archive-700 hover:bg-archive-50"}`}
          >
            My uploads
          </Link>
        </div>
        <ScopeToggle
          basePath={`/trees/${treeId}/media`}
          scope={view.scope}
          params={{ type, tag, person, mine }}
          anchorName={view.anchorName}
        />
        <form method="GET" className="ml-auto flex flex-wrap items-center gap-2">
          {mine && <input type="hidden" name="mine" value="1" />}
          {view.scope === "all" && <input type="hidden" name="scope" value="all" />}
          <select name="type" defaultValue={type ?? ""} className={`${inputClass} w-auto`}>
            <option value="">All types</option>
            {MEDIA_TYPES.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {MEDIA_TYPE_LABELS[mediaType]}
              </option>
            ))}
          </select>
          <select name="tag" defaultValue={tag ?? ""} className={`${inputClass} w-auto`}>
            <option value="">All tags</option>
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
          <button type="submit" className={subtleButtonClass}>
            Filter
          </button>
        </form>
      </div>

      {canUpload && (
        <div className="mb-6">
          <MediaUpload treeId={treeId} accept={accept} />
        </div>
      )}

      {mediaList.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            {canUpload
              ? "No media yet — upload the first photos, videos, or documents."
              : "No media in this tree yet."}
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
    </div>
  );
}
