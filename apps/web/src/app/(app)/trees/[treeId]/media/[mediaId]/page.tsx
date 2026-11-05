import { requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaPeople, mediaTags, people, tags, users } from "@familyarchive/db";
import {
  formatBytes,
  formatDateParts,
  isBrowserRenderableImage,
  isImageMime,
  isOcrEligible,
  MEDIA_TYPE_LABELS,
  mediaTypesForMime,
  treeRoleAtLeast,
} from "@familyarchive/shared";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  buttonClass,
  Card,
  dangerButtonClass,
  DateFields,
  Field,
  FormError,
  inputClass,
  menuItemClass,
  menuPanelClass,
  popoverPanelClass,
  subtleButtonClass,
} from "@/components/form";
import { FaceTagger } from "@/components/face-tagger";
import { MediaNav } from "@/components/media-nav";
import { PersonPicker } from "@/components/person-picker";
import { SuggestForm } from "@/components/suggest-form";
import { Alert, Badge } from "@/components/ui";
import {
  addMediaToCollectionAction,
  removeMediaFromCollectionAction,
} from "@/app/(app)/trees/[treeId]/collections/actions";
import { collectionsForMedia, listCollections } from "@/lib/collections";
import { listFaces } from "@/lib/faces";
import {
  adjacentMedia,
  canEditMedia,
  derivativeUrl,
  getMediaItem,
  listDerivatives,
  mediaUrl,
} from "@/lib/media";
import { countPeople, getPlaceName } from "@/lib/people";

import { aiConfigured } from "@/lib/jobs";

import {
  addFaceBoxAction,
  addMediaPersonAction,
  addMediaTagAction,
  aiCleanupAction,
  assignFacePersonAction,
  deleteMediaAction,
  detectFacesAction,
  removeFaceAction,
  removeMediaPersonAction,
  removeMediaTagAction,
  reprocessMediaAction,
  runOcrAction,
  saveTranscriptionAction,
  setProfilePhotoAction,
  updateMediaAction,
} from "./actions";

const iconButtonClass =
  "flex size-9.5 cursor-pointer items-center justify-center rounded-md border " +
  "border-archive-200 bg-surface text-archive-700 hover:bg-archive-50";

/** The × on a chip: a 24px target, the size of the chip's text line and its padding. */
const chipRemoveClass =
  "flex size-6 items-center justify-center rounded-full text-archive-700 " +
  "hover:bg-danger-soft hover:text-danger";

/**
 * Past this an item still "preparing" has probably lost its job (Valkey down at
 * upload, or restarted without its data), and without a retry it would stay that way.
 */
const STALLED_PROCESSING_MS = 15 * 60 * 1000;

export default async function MediaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string; mediaId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId, mediaId } = await params;
  const { user, role, isMember } = await requireTreeRole(treeId, "viewer");
  const { error } = await searchParams;

  const media = await getMediaItem(treeId, mediaId);
  if (!media) notFound();

  const db = getDb();
  const canTag = treeRoleAtLeast(role, "contributor");
  const [itemTags, taggedPeople, uploaderRows, placeName, peopleCount] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name })
      .from(mediaTags)
      .innerJoin(tags, eq(mediaTags.tagId, tags.id))
      .where(eq(mediaTags.mediaId, mediaId)),
    db
      .select({ rowId: mediaPeople.id, personId: people.id, fullName: people.fullName })
      .from(mediaPeople)
      .innerJoin(people, eq(mediaPeople.personId, people.id))
      // Soft-deleting a person leaves media_people rows behind, so without the
      // deletedAt filter deleted people stayed listed as tags on the media —
      // and disagreed with this page's own "add a tag" list, which excludes them.
      .where(
        and(eq(mediaPeople.mediaId, mediaId), eq(people.treeId, treeId), isNull(people.deletedAt)),
      ),
    media.uploaderId
      ? db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, media.uploaderId))
          .limit(1)
      : Promise.resolve([]),
    getPlaceName(media.placeId),
    canTag ? countPeople(treeId) : 0,
  ]);
  const derivatives = await listDerivatives(mediaId);
  const { prevId, nextId } = await adjacentMedia(treeId, media);
  const pdfPages = derivatives.filter((d) => d.kind === "pdf_page");
  const videoThumb = derivatives.find((d) => d.kind === "video_thumb");
  const thumb = derivatives.find((d) => d.kind === "thumb");
  const [memberOf, allCollections] = await Promise.all([
    collectionsForMedia(treeId, mediaId),
    listCollections(treeId),
  ]);
  const joinableCollections = allCollections.filter((c) => !memberOf.some((m) => m.id === c.id));
  const faces = isImageMime(media.mimeType) ? await listFaces(mediaId) : [];
  const meta = media.metadata as {
    processing?: { error?: string | null };
    ocr?: { status?: string; error?: string | null; pages?: number; totalPages?: number | null };
    ai?: { status?: string; error?: string | null; provider?: string };
    faces?: { status?: string; error?: string | null; count?: number };
  };
  const processingError = meta.processing?.error ?? null;
  const processingStalled =
    (media.processingStatus === "pending" ||
      media.processingStatus === "processing" ||
      media.processingStatus === "retrying") &&
    Date.now() - media.updatedAt.getTime() > STALLED_PROCESSING_MS;
  const ocrPages = meta.ocr?.pages ?? 0;
  const ocrTotalPages = meta.ocr?.totalPages ?? 0;
  const typeOptions = [...new Set([...mediaTypesForMime(media.mimeType), media.mediaType])];
  const showText = isOcrEligible(media.mediaType);
  const aiAvailable = aiConfigured();

  const canEdit = canEditMedia(user, role, media);
  const isEditor = treeRoleAtLeast(role, "editor");
  const chipClass = `flex min-h-7 items-center gap-1 rounded-full py-0.5 pl-3 text-sm ${
    canTag ? "pr-1" : "pr-3"
  }`;
  const url = mediaUrl(treeId, mediaId);
  const dateText = formatDateParts({
    year: media.dateYear,
    month: media.dateMonth,
    day: media.dateDay,
    approx: media.dateApprox,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <FormError message={error} />
      {media.title ? null : <h1 className="sr-only">{media.originalFilename}</h1>}

      {/* Stage: the media is the page. Chevrons + arrow keys navigate the library. */}
      <div className="relative overflow-hidden rounded-xl bg-archive-100/40">
        <div className="flex items-center justify-center">
          {/* HEIC and TIFF are accepted on upload but decode in no mainstream
              browser, and there is no full-size derivative to substitute — so
              they fall through to the download card rather than a broken <img>
              with a face-tagging overlay sitting on nothing. */}
          {isBrowserRenderableImage(media.mimeType) ? (
            <FaceTagger
              imageUrl={url}
              alt={media.title ?? media.originalFilename}
              faces={faces}
              treeId={treeId}
              canTag={canTag}
              assignAction={assignFacePersonAction}
              removeAction={removeFaceAction}
              addAction={addFaceBoxAction}
              hiddenFields={{ treeId, mediaId }}
            />
          ) : media.mimeType.startsWith("video/") ? (
            <video
              controls
              preload="metadata"
              src={url}
              poster={videoThumb ? derivativeUrl(treeId, mediaId, videoThumb.id) : undefined}
              className="max-h-[70vh] w-full"
            />
          ) : media.mimeType.startsWith("audio/") ? (
            <div className="w-full px-6 py-10">
              <audio controls src={url} className="w-full" />
            </div>
          ) : (
            <div className="py-14 text-center">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={derivativeUrl(treeId, mediaId, thumb.id)}
                  alt={media.title ?? media.originalFilename}
                  className="mx-auto max-h-[60vh] rounded"
                />
              ) : (
                <div className="text-5xl">📄</div>
              )}
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
        <MediaNav
          prevUrl={prevId ? `/trees/${treeId}/media/${prevId}` : null}
          nextUrl={nextId ? `/trees/${treeId}/media/${nextId}` : null}
        />
      </div>

      {/* Caption zone: only what a person wrote — plus the discoverability rail.
          A phone has no room for a panel hung from an icon button short of the row's end,
          so below sm the Info and Edit details aren't positioned and their panels span the
          screen. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {media.title && (
            <h1 className="text-xl font-semibold [overflow-wrap:anywhere]">{media.title}</h1>
          )}
          {media.description && (
            <p className="text-sm leading-relaxed whitespace-pre-line text-archive-700">
              {media.description}
            </p>
          )}
          {(dateText || placeName) && (
            <p className="text-sm text-archive-700">
              {[dateText, placeName].filter(Boolean).join(" · ")}
            </p>
          )}
          {media.processingStatus !== "processed" && (
            <p>
              <Badge tone={media.processingStatus === "failed" ? "danger" : "neutral"}>
                {media.processingStatus === "failed" ? "Failed" : "Preparing…"}
              </Badge>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <details className="sm:relative">
            <summary className={`${iconButtonClass} list-none`} title="Info" aria-label="Info">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-5M12 8h.01" />
              </svg>
            </summary>
            <div
              className={`${popoverPanelClass} absolute inset-x-4 mt-2 sm:right-0 sm:left-auto sm:w-[26rem]`}
            >
              <dl className="space-y-1.5 text-sm">
                <div>
                  <dt className="inline font-medium">Type: </dt>
                  <dd className="inline text-archive-700">{MEDIA_TYPE_LABELS[media.mediaType]}</dd>
                </div>
                {dateText && (
                  <div>
                    <dt className="inline font-medium">Date: </dt>
                    <dd className="inline text-archive-700">{dateText}</dd>
                  </div>
                )}
                {placeName && (
                  <div>
                    <dt className="inline font-medium">Place: </dt>
                    <dd className="inline text-archive-700">{placeName}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-medium">Added: </dt>
                  <dd className="inline text-archive-700">
                    {/* An address is for fellow members, not visitors to a public archive. */}
                    by{" "}
                    {uploaderRows[0]?.name ??
                      (isMember ? uploaderRows[0]?.email : null) ??
                      "unknown"}{" "}
                    on {media.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">File: </dt>
                  <dd className="inline text-archive-700">
                    {media.originalFilename} · {formatBytes(media.fileSize)}
                  </dd>
                </div>
              </dl>

              <h3 className="mt-4 mb-2 text-sm font-semibold">Collections</h3>
              {memberOf.length > 0 ? (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {memberOf.map((collection) => (
                    <li key={collection.id} className={`${chipClass} bg-archive-100`}>
                      <Link
                        href={`/trees/${treeId}/collections/${collection.id}`}
                        className="py-0.5 hover:text-accent-600"
                      >
                        {collection.name}
                      </Link>
                      {canTag && (
                        <form action={removeMediaFromCollectionAction}>
                          <input type="hidden" name="treeId" value={treeId} />
                          <input type="hidden" name="collectionId" value={collection.id} />
                          <input type="hidden" name="mediaId" value={mediaId} />
                          <button
                            type="submit"
                            className={chipRemoveClass}
                            title="Remove from collection"
                          >
                            ×
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-2 text-sm text-archive-700">Not in any collection.</p>
              )}
              {canTag && joinableCollections.length > 0 && (
                <form action={addMediaToCollectionAction} className="flex items-center gap-2">
                  <input type="hidden" name="treeId" value={treeId} />
                  <input type="hidden" name="mediaId" value={mediaId} />
                  <select name="collectionId" required className={`${inputClass} min-w-0 flex-1`}>
                    <option value="">Add to collection…</option>
                    {joinableCollections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={subtleButtonClass}>
                    Add
                  </button>
                </form>
              )}

              <h3 className="mt-4 mb-2 text-sm font-semibold">Tags</h3>
              {itemTags.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {itemTags.map((tag) => (
                    <li key={tag.id} className={`${chipClass} bg-archive-100`}>
                      <Link
                        href={`/trees/${treeId}/media?tag=${tag.id}`}
                        className="py-0.5 hover:text-accent-600"
                      >
                        {tag.name}
                      </Link>
                      {canTag && (
                        <form action={removeMediaTagAction}>
                          <input type="hidden" name="treeId" value={treeId} />
                          <input type="hidden" name="mediaId" value={mediaId} />
                          <input type="hidden" name="tagId" value={tag.id} />
                          <button type="submit" className={chipRemoveClass} title="Remove">
                            ×
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canTag ? (
                <form action={addMediaTagAction} className="flex items-center gap-2">
                  <input type="hidden" name="treeId" value={treeId} />
                  <input type="hidden" name="mediaId" value={mediaId} />
                  <input
                    name="name"
                    required
                    maxLength={100}
                    placeholder="Add a tag…"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button type="submit" className={subtleButtonClass}>
                    Add
                  </button>
                </form>
              ) : (
                itemTags.length === 0 && <p className="text-sm text-archive-700">No tags yet.</p>
              )}
            </div>
          </details>

          {canEdit && (
            <details className="sm:relative">
              <summary
                className={`${iconButtonClass} list-none`}
                title="Edit details"
                aria-label="Edit details"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </summary>
              <div
                className={`${popoverPanelClass} absolute inset-x-4 mt-2 sm:right-0 sm:left-auto sm:w-[28rem]`}
              >
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
                  <Field label="Type">
                    <select name="mediaType" defaultValue={media.mediaType} className={inputClass}>
                      {typeOptions.map((mediaType) => (
                        <option key={mediaType} value={mediaType}>
                          {MEDIA_TYPE_LABELS[mediaType]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <DateFields
                    prefix="date"
                    year={media.dateYear}
                    month={media.dateMonth}
                    day={media.dateDay}
                    approx={media.dateApprox}
                  />
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
              </div>
            </details>
          )}

          <details className="relative">
            <summary
              className={`${iconButtonClass} list-none`}
              title="More options"
              aria-label="More options"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </summary>
            <div className={`${menuPanelClass} absolute right-0 mt-2 w-60`}>
              <a href={url} download={media.originalFilename} className={menuItemClass}>
                Download original
              </a>
              {isEditor && isImageMime(media.mimeType) && taggedPeople.length > 0 && (
                <details>
                  <summary className={menuItemClass}>Use as profile photo</summary>
                  <div className="pl-3">
                    {taggedPeople.map((tagged) => (
                      <form key={tagged.rowId} action={setProfilePhotoAction}>
                        <input type="hidden" name="treeId" value={treeId} />
                        <input type="hidden" name="mediaId" value={mediaId} />
                        <input type="hidden" name="personId" value={tagged.personId} />
                        <button type="submit" className={`${menuItemClass} text-archive-700`}>
                          {tagged.fullName}
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              )}
              {isEditor && (
                <details>
                  <summary className={`${menuItemClass} text-danger hover:bg-danger-soft`}>
                    Delete…
                  </summary>
                  <div className="space-y-2 px-3 py-2">
                    <p className="text-xs text-archive-700">
                      Moves this item to Trash. An editor can restore it from there with its tags
                      and collections. It keeps using storage until an admin removes it permanently.
                    </p>
                    <form action={deleteMediaAction}>
                      <input type="hidden" name="treeId" value={treeId} />
                      <input type="hidden" name="mediaId" value={mediaId} />
                      <button type="submit" className={`${dangerButtonClass} w-full`}>
                        Move to Trash
                      </button>
                    </form>
                  </div>
                </details>
              )}
            </div>
          </details>
        </div>
      </div>

      {/* People are content — chips stay visible; adding collapses into "+ Add".
          That button lands wherever the chips end, so its panel only hangs from it at xl,
          where the page's margin leaves room at any position. Below that the panel hangs
          from this row, and below sm spans the screen like the ones above. */}
      <div className="flex flex-wrap items-center gap-2 sm:relative">
        {taggedPeople.map((tagged) => (
          <span key={tagged.rowId} className={`${chipClass} border border-archive-100 bg-surface`}>
            <Link
              href={`/trees/${treeId}/people/${tagged.personId}`}
              className="py-0.5 hover:text-accent-600"
            >
              {tagged.fullName}
            </Link>
            {canTag && (
              <form action={removeMediaPersonAction}>
                <input type="hidden" name="treeId" value={treeId} />
                <input type="hidden" name="mediaId" value={mediaId} />
                <input type="hidden" name="tagRowId" value={tagged.rowId} />
                <button type="submit" className={chipRemoveClass} title="Remove tag">
                  ×
                </button>
              </form>
            )}
          </span>
        ))}
        {canTag && peopleCount > taggedPeople.length && (
          <details className="xl:relative">
            <summary
              className="cursor-pointer list-none rounded-full border border-dashed border-archive-200 px-3 py-1 text-sm text-archive-700 hover:bg-archive-50"
              title={
                isBrowserRenderableImage(media.mimeType)
                  ? "Tag someone — or click their face in the photo"
                  : "Tag someone in this item"
              }
            >
              + Tag someone
            </summary>
            <form
              action={addMediaPersonAction}
              className="absolute inset-x-4 z-20 mt-2 flex items-center gap-2 rounded-md border border-archive-100 bg-surface p-2 shadow-lg sm:right-auto sm:left-0 sm:w-72"
            >
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={mediaId} />
              <PersonPicker
                treeId={treeId}
                name="personId"
                ariaLabel="Person to tag"
                required
                excludeIds={taggedPeople.map((t) => t.personId)}
                className="min-w-0 flex-1"
              />
              <button type="submit" className={subtleButtonClass}>
                Tag
              </button>
            </form>
          </details>
        )}
      </div>

      {media.processingStatus !== "processed" && media.processingStatus !== "failed" && (
        <Card>
          <p className="text-sm text-archive-700">
            {processingStalled
              ? "This file is taking longer than expected to prepare."
              : "We're preparing this file — previews and text appear here automatically in a moment."}
          </p>
          {processingStalled && isEditor && (
            <form action={reprocessMediaAction} className="mt-3">
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={mediaId} />
              <button
                type="submit"
                title="Prepares the file again from the original"
                className={subtleButtonClass}
              >
                Try again
              </button>
            </form>
          )}
        </Card>
      )}
      {media.processingStatus === "failed" && (
        <Card>
          <p className="text-sm text-archive-700">
            Something went wrong while preparing this file.
          </p>
          {processingError && (
            <details className="mt-2">
              <summary className="cursor-pointer py-1 text-xs text-archive-700">
                Technical details
              </summary>
              <Alert tone="danger" className="mt-1">
                {processingError}
              </Alert>
            </details>
          )}
          {isEditor && (
            <form action={reprocessMediaAction} className="mt-3">
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={mediaId} />
              <button
                type="submit"
                title="Prepares the file again from the original"
                className={subtleButtonClass}
              >
                Try again
              </button>
            </form>
          )}
        </Card>
      )}
      {media.mediaType === "photo" && meta.faces?.status === "failed" && (
        <Card>
          <p className="text-sm text-archive-700">We couldn&apos;t look for faces in this photo.</p>
          {isEditor && (
            <form action={detectFacesAction} className="mt-3">
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={mediaId} />
              <button
                type="submit"
                title="Looks for faces in the photo again"
                className={subtleButtonClass}
              >
                Try again
              </button>
            </form>
          )}
        </Card>
      )}

      {showText && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Text</h2>
          {(meta.ocr?.status === "queued" || meta.ocr?.status === "running") && (
            <p className="mb-3 text-sm text-archive-700">Reading the text in this document…</p>
          )}
          {meta.ocr?.status === "failed" && (
            <Alert tone="danger" className="mb-3">
              We couldn&apos;t read the text in this document automatically.
            </Alert>
          )}
          {ocrTotalPages > ocrPages && ocrPages > 0 && (
            <Alert tone="warn" className="mb-3">
              Text was read from the first {ocrPages} of {ocrTotalPages} pages. The rest of this
              document isn&apos;t searchable.
            </Alert>
          )}
          {meta.ai?.status === "failed" && (
            <Alert tone="danger" className="mb-3">
              The AI tidy-up didn&apos;t work — you can try again.
            </Alert>
          )}

          {media.ocrText ? (
            <details className="mb-4" open={!media.transcriptionText}>
              <summary className="cursor-pointer py-1 text-sm font-medium">Extracted text</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-archive-100/50 p-3 text-xs whitespace-pre-wrap text-archive-800">
                {media.ocrText}
              </pre>
            </details>
          ) : (
            <p className="mb-4 text-sm text-archive-700">No text extracted yet.</p>
          )}

          {isEditor && (
            <div className="mb-5 flex flex-wrap gap-2">
              <form action={runOcrAction}>
                <input type="hidden" name="treeId" value={treeId} />
                <input type="hidden" name="mediaId" value={mediaId} />
                <button
                  type="submit"
                  title="Reads the document with text recognition (OCR)"
                  className={subtleButtonClass}
                >
                  {media.ocrText ? "Extract text again" : "Extract text"}
                </button>
              </form>
              {aiAvailable && (
                <form action={aiCleanupAction}>
                  <input type="hidden" name="treeId" value={treeId} />
                  <input type="hidden" name="mediaId" value={mediaId} />
                  <button
                    type="submit"
                    className={subtleButtonClass}
                    title="Sends the extracted text to your AI provider and saves the tidied version as the transcription"
                  >
                    Tidy up with AI
                  </button>
                </form>
              )}
            </div>
          )}

          <h3 className="mb-2 text-sm font-semibold">Transcription</h3>
          {canEdit ? (
            <form action={saveTranscriptionAction} className="space-y-2">
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={mediaId} />
              <textarea
                name="transcription"
                rows={8}
                defaultValue={media.transcriptionText ?? ""}
                placeholder="Type or correct the document's text here…"
                className={inputClass}
              />
              <button type="submit" className={subtleButtonClass}>
                Save transcription
              </button>
            </form>
          ) : media.transcriptionText ? (
            <pre className="max-h-96 overflow-auto rounded-md bg-archive-100/50 p-3 text-xs whitespace-pre-wrap text-archive-800">
              {media.transcriptionText}
            </pre>
          ) : (
            <p className="text-sm text-archive-700">No transcription yet.</p>
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

      {isMember && !isEditor && (
        <SuggestForm
          treeId={treeId}
          targetType="media"
          targetId={mediaId}
          targetLabel={media.title || media.originalFilename}
          returnTo={`/trees/${treeId}/media/${mediaId}`}
        />
      )}
    </div>
  );
}
