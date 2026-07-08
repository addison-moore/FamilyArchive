import { requireTreeRole } from "@familyarchive/auth";
import { isImageMime, treeRoleAtLeast } from "@familyarchive/shared";
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
import { MediaThumb } from "@/components/media-thumb";
import { getCollection, listCollectionMedia } from "@/lib/collections";
import { thumbUrls } from "@/lib/media";

import {
  deleteCollectionAction,
  setCollectionCoverAction,
  updateCollectionAction,
} from "../actions";

/** Collection detail (PRD §16.3): cover, title, description, date range, media grid. */
export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string; collectionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId, collectionId } = await params;
  const { role } = await requireTreeRole(treeId, "viewer");
  const { error } = await searchParams;

  const collection = await getCollection(treeId, collectionId);
  if (!collection) notFound();

  const media = await listCollectionMedia(collectionId);
  const thumbs = await thumbUrls(
    treeId,
    media.map((m) => m.id),
  );
  const canEdit = treeRoleAtLeast(role, "editor");
  const range = [collection.startYear, collection.endYear].filter(Boolean).join("–");
  const imageMembers = media.filter((m) => isImageMime(m.mimeType));

  return (
    <div className="space-y-6">
      <FormError message={error} />
      <div>
        <h1 className="text-2xl font-semibold">{collection.name}</h1>
        <p className="mt-1 text-sm text-archive-700/80">
          {media.length} item(s){range ? ` · ${range}` : ""}
        </p>
        {collection.description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed whitespace-pre-line text-archive-700">
            {collection.description}
          </p>
        )}
      </div>

      {media.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            No media yet — add items from any media detail page.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {media.map((item) => (
            <MediaThumb key={item.id} treeId={treeId} media={item} thumbUrl={thumbs.get(item.id)} />
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Edit collection</h2>
            <form action={updateCollectionAction} className="space-y-4">
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="collectionId" value={collectionId} />
              <Field label="Name">
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={collection.name}
                  className={inputClass}
                />
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  rows={3}
                  maxLength={5000}
                  defaultValue={collection.description ?? ""}
                  className={inputClass}
                />
              </Field>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="From year">
                  <input
                    name="startYear"
                    type="number"
                    min={1}
                    max={9999}
                    defaultValue={collection.startYear ?? ""}
                    className={`${inputClass} w-28`}
                  />
                </Field>
                <Field label="To year">
                  <input
                    name="endYear"
                    type="number"
                    min={1}
                    max={9999}
                    defaultValue={collection.endYear ?? ""}
                    className={`${inputClass} w-28`}
                  />
                </Field>
                <button type="submit" className={buttonClass}>
                  Save
                </button>
              </div>
            </form>
            {imageMembers.length > 0 && (
              <form
                action={setCollectionCoverAction}
                className="mt-5 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="treeId" value={treeId} />
                <input type="hidden" name="collectionId" value={collectionId} />
                <Field label="Cover image">
                  <select
                    name="mediaId"
                    defaultValue={collection.coverMediaId ?? ""}
                    className={`${inputClass} w-64`}
                  >
                    <option value="">Select an image…</option>
                    {imageMembers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title || item.originalFilename}
                      </option>
                    ))}
                  </select>
                </Field>
                <button type="submit" className={subtleButtonClass}>
                  Set cover
                </button>
              </form>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold text-danger">Delete collection</h2>
            <p className="mb-4 text-sm text-archive-700/80">
              Removes the collection only — its media stays in the library.
            </p>
            <form action={deleteCollectionAction}>
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="collectionId" value={collectionId} />
              <button type="submit" className={dangerButtonClass}>
                Delete {collection.name}
              </button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
