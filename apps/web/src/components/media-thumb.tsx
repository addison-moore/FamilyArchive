import { isImageMime, MEDIA_TYPE_LABELS } from "@familyarchive/shared";
import Link from "next/link";

import type { MediaRow } from "@/lib/media";
import { mediaUrl } from "@/lib/media";

const TYPE_ICONS: Record<string, string> = {
  video: "🎞",
  audio: "🎙",
  pdf: "📄",
  document: "📜",
  photo: "🖼",
};

/**
 * Grid tile. Prefers the generated thumbnail (M7); falls back to the scaled
 * original for images that haven't processed yet, else a labeled type card.
 */
export function MediaThumb({
  treeId,
  media,
  thumbUrl,
}: {
  treeId: string;
  media: MediaRow;
  thumbUrl?: string | null;
}) {
  const label = media.title || media.originalFilename;
  const imageSrc = thumbUrl ?? (isImageMime(media.mimeType) ? mediaUrl(treeId, media.id) : null);
  return (
    <Link
      href={`/trees/${treeId}/media/${media.id}`}
      className="group block overflow-hidden rounded-lg border border-archive-100 bg-surface shadow-sm hover:shadow-md"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-archive-100/50">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={label}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="text-center">
            <div className="text-4xl">{TYPE_ICONS[media.mediaType] ?? "📁"}</div>
            <div className="mt-1 text-xs text-archive-700/70">
              {MEDIA_TYPE_LABELS[media.mediaType]}
            </div>
          </div>
        )}
        {media.processingStatus !== "processed" && (
          <span
            className={`absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              media.processingStatus === "failed"
                ? "bg-danger-soft text-danger"
                : "bg-archive-100 text-archive-700"
            }`}
          >
            {media.processingStatus}
          </span>
        )}
      </div>
      <div className="truncate px-2.5 py-2 text-xs text-archive-700">{label}</div>
    </Link>
  );
}
