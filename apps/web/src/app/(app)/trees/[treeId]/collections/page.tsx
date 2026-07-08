import { requireTreeRole } from "@familyarchive/auth";
import { treeRoleAtLeast } from "@familyarchive/shared";
import Link from "next/link";

import { buttonClass, Card } from "@/components/form";
import { listCollections } from "@/lib/collections";
import { thumbUrls } from "@/lib/media";

/** Collections browsing (PRD §16.3). */
export default async function CollectionsPage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const { role } = await requireTreeRole(treeId, "viewer");

  const collectionsList = await listCollections(treeId);
  const covers = await thumbUrls(
    treeId,
    collectionsList.map((c) => c.coverMediaId).filter((id): id is string => id !== null),
  );
  const canEdit = treeRoleAtLeast(role, "editor");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Collections</h1>
        {canEdit && (
          <Link
            href={`/trees/${treeId}/collections/new`}
            className={`${buttonClass} ml-auto no-underline`}
          >
            New collection
          </Link>
        )}
      </div>

      {collectionsList.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            {canEdit
              ? "No collections yet — group related photos, documents, and recordings into albums."
              : "No collections in this archive yet."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {collectionsList.map((collection) => {
            const cover = collection.coverMediaId ? covers.get(collection.coverMediaId) : undefined;
            const range = [collection.startYear, collection.endYear].filter(Boolean).join("–");
            return (
              <Link
                key={collection.id}
                href={`/trees/${treeId}/collections/${collection.id}`}
                className="group block overflow-hidden rounded-xl border border-archive-100 bg-surface shadow-sm hover:shadow-md"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-archive-100/50">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <span className="text-4xl">🗂</span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <div className="truncate font-medium">{collection.name}</div>
                  <div className="text-xs text-archive-700/70">
                    {collection.mediaCount} item(s){range ? ` · ${range}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
