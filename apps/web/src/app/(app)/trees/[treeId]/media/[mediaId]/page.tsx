import { requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaPeople, mediaTags, people, tags, users } from "@familyarchive/db";
import {
  formatDateParts,
  isImageMime,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPES,
  treeRoleAtLeast,
} from "@familyarchive/shared";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
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
import { canEditMedia, derivativeUrl, getMediaItem, listDerivatives, mediaUrl } from "@/lib/media";
import { getPlaceName, listPeople } from "@/lib/people";

import {
  addMediaPersonAction,
  addMediaTagAction,
  deleteMediaAction,
  removeMediaPersonAction,
  removeMediaTagAction,
  reprocessMediaAction,
  setProfilePhotoAction,
  updateMediaAction,
} from "./actions";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default async function MediaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string; mediaId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId, mediaId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const { error } = await searchParams;

  const media = await getMediaItem(treeId, mediaId);
  if (!media) notFound();

  const db = getDb();
  const [itemTags, taggedPeople, uploaderRows, placeName, allPeople] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name })
      .from(mediaTags)
      .innerJoin(tags, eq(mediaTags.tagId, tags.id))
      .where(eq(mediaTags.mediaId, mediaId)),
    db
      .select({ rowId: mediaPeople.id, personId: people.id, fullName: people.fullName })
      .from(mediaPeople)
      .innerJoin(people, eq(mediaPeople.personId, people.id))
      .where(and(eq(mediaPeople.mediaId, mediaId))),
    media.uploaderId
      ? db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, media.uploaderId))
          .limit(1)
      : Promise.resolve([]),
    getPlaceName(media.placeId),
    listPeople(treeId),
  ]);
  const derivatives = await listDerivatives(mediaId);
  const pdfPages = derivatives.filter((d) => d.kind === "pdf_page");
  const processingError =
    (media.metadata as { processing?: { error?: string | null } }).processing?.error ?? null;

  const canEdit = canEditMedia(user, role, media);
  const canTag = treeRoleAtLeast(role, "contributor");
  const isEditor = treeRoleAtLeast(role, "editor");
  const url = mediaUrl(treeId, mediaId);
  const untaggedPeople = allPeople.filter((p) => !taggedPeople.some((t) => t.personId === p.id));
  const dateText = formatDateParts({
    year: media.dateYear,
    month: media.dateMonth,
    day: media.dateDay,
    approx: media.dateApprox,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <FormError message={error} />

      <Card>
        <div className="flex items-center justify-center bg-archive-100/40">
          {isImageMime(media.mimeType) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={media.title ?? media.originalFilename}
              className="max-h-[70vh] rounded"
            />
          ) : media.mediaType === "video" ? (
            <video controls src={url} className="max-h-[70vh] w-full rounded" />
          ) : media.mediaType === "audio" ? (
            <audio controls src={url} className="w-full" />
          ) : (
            <div className="py-10 text-center">
              <div className="text-5xl">📄</div>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={`${buttonClass} mt-4 inline-block no-underline`}
              >
                Open {MEDIA_TYPE_LABELS[media.mediaType]}
              </a>
            </div>
          )}
        </div>
        <div className="mt-4">
          <h1 className="text-xl font-semibold">{media.title || media.originalFilename}</h1>
          {media.description && (
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-archive-700">
              {media.description}
            </p>
          )}
          <p className="mt-2 text-xs text-archive-700/70">
            {MEDIA_TYPE_LABELS[media.mediaType]}
            {dateText ? ` · ${dateText}` : ""}
            {placeName ? ` · ${placeName}` : ""} · {formatBytes(media.fileSize)} · {media.mimeType}{" "}
            · uploaded by {uploaderRows[0]?.name ?? uploaderRows[0]?.email ?? "unknown"} on{" "}
            {media.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
            {media.processingStatus !== "processed" && (
              <span className="ml-2 rounded bg-archive-100 px-1.5 py-0.5">
                {media.processingStatus}
              </span>
            )}
          </p>
        </div>
      </Card>

      {(media.processingStatus !== "processed" || isEditor) && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Processing</h2>
          <p className="text-sm text-archive-700">
            Status: <strong>{media.processingStatus}</strong>
            {derivatives.length > 0 && ` · ${derivatives.length} derivative(s)`}
          </p>
          {media.processingStatus === "failed" && processingError && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {processingError}
            </p>
          )}
          {isEditor && (
            <form action={reprocessMediaAction} className="mt-3">
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={mediaId} />
              <button type="submit" className={subtleButtonClass}>
                {media.processingStatus === "failed" ? "Retry processing" : "Reprocess"}
              </button>
            </form>
          )}
        </Card>
      )}

      {pdfPages.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Pages</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pdfPages.map((page) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={page.id}
                src={derivativeUrl(treeId, mediaId, page.id)}
                alt={`Page ${page.page}`}
                loading="lazy"
                className="rounded border border-archive-100"
              />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">People in this media</h2>
        {taggedPeople.length > 0 ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {taggedPeople.map((tagged) => (
              <li
                key={tagged.rowId}
                className="flex items-center gap-2 rounded-full border border-archive-100 bg-archive-50 py-1 pr-2 pl-3 text-sm"
              >
                <Link
                  href={`/trees/${treeId}/people/${tagged.personId}`}
                  className="hover:text-accent-600"
                >
                  {tagged.fullName}
                </Link>
                {isEditor && isImageMime(media.mimeType) && (
                  <form action={setProfilePhotoAction}>
                    <input type="hidden" name="treeId" value={treeId} />
                    <input type="hidden" name="mediaId" value={mediaId} />
                    <input type="hidden" name="personId" value={tagged.personId} />
                    <button
                      type="submit"
                      title={`Use as ${tagged.fullName}'s profile photo`}
                      className="text-xs text-archive-700/60 hover:text-accent-600"
                    >
                      set profile photo
                    </button>
                  </form>
                )}
                {canTag && (
                  <form action={removeMediaPersonAction}>
                    <input type="hidden" name="treeId" value={treeId} />
                    <input type="hidden" name="mediaId" value={mediaId} />
                    <input type="hidden" name="tagRowId" value={tagged.rowId} />
                    <button
                      type="submit"
                      className="text-archive-700/50 hover:text-red-700"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-archive-700/70">No people tagged yet.</p>
        )}
        {canTag && untaggedPeople.length > 0 && (
          <form action={addMediaPersonAction} className="flex items-end gap-2">
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="mediaId" value={mediaId} />
            <Field label="Tag a person">
              <select name="personId" required className={`${inputClass} w-56`}>
                <option value="">Select…</option>
                {untaggedPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={subtleButtonClass}>
              Tag
            </button>
          </form>
        )}
        <p className="mt-3 text-xs text-archive-700/60">
          Face detection with clickable face boxes arrives in Milestone 9.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Tags</h2>
        {itemTags.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {itemTags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-1.5 rounded-full bg-archive-100 py-1 pr-2 pl-3 text-sm"
              >
                <Link
                  href={`/trees/${treeId}/media?tag=${tag.id}`}
                  className="hover:text-accent-600"
                >
                  {tag.name}
                </Link>
                {canTag && (
                  <form action={removeMediaTagAction}>
                    <input type="hidden" name="treeId" value={treeId} />
                    <input type="hidden" name="mediaId" value={mediaId} />
                    <input type="hidden" name="tagId" value={tag.id} />
                    <button
                      type="submit"
                      className="text-archive-700/50 hover:text-red-700"
                      title="Remove"
                    >
                      ×
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canTag && (
          <form action={addMediaTagAction} className="flex items-end gap-2">
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="mediaId" value={mediaId} />
            <Field label="Add tag">
              <input name="name" required maxLength={100} className={`${inputClass} w-56`} />
            </Field>
            <button type="submit" className={subtleButtonClass}>
              Add
            </button>
          </form>
        )}
      </Card>

      {canEdit && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Edit details</h2>
          <form action={updateMediaAction} className="space-y-4">
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="mediaId" value={mediaId} />
            <Field label="Title">
              <input
                name="title"
                maxLength={300}
                defaultValue={media.title ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Description / caption">
              <textarea
                name="description"
                rows={3}
                maxLength={10000}
                defaultValue={media.description ?? ""}
                className={inputClass}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Type">
                <select
                  name="mediaType"
                  defaultValue={media.mediaType}
                  className={`${inputClass} w-auto`}
                >
                  {MEDIA_TYPES.map((mediaType) => (
                    <option key={mediaType} value={mediaType}>
                      {MEDIA_TYPE_LABELS[mediaType]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <input
                  name="dateYear"
                  type="number"
                  min={1}
                  max={9999}
                  defaultValue={media.dateYear ?? ""}
                  className={`${inputClass} w-24`}
                />
              </Field>
              <Field label="Month">
                <input
                  name="dateMonth"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={media.dateMonth ?? ""}
                  className={`${inputClass} w-20`}
                />
              </Field>
              <Field label="Day">
                <input
                  name="dateDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={media.dateDay ?? ""}
                  className={`${inputClass} w-20`}
                />
              </Field>
              <label className="flex items-center gap-1.5 pb-2 text-sm">
                <input type="checkbox" name="dateApprox" defaultChecked={media.dateApprox} />
                approximate
              </label>
            </div>
            <Field label="Place">
              <input
                name="place"
                maxLength={300}
                defaultValue={placeName ?? ""}
                className={inputClass}
              />
            </Field>
            <button type="submit" className={buttonClass}>
              Save
            </button>
          </form>
        </Card>
      )}

      {isEditor && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-red-700">Delete media</h2>
          <p className="mb-4 text-sm text-archive-700/80">
            Hides this item from the library (soft delete). The original file is preserved in
            storage.
          </p>
          <form action={deleteMediaAction}>
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="mediaId" value={mediaId} />
            <button type="submit" className={dangerButtonClass}>
              Delete {media.title || media.originalFilename}
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
