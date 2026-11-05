import Link from "next/link";

import { restoreMediaAction, restorePersonAction } from "@/app/(app)/trees/[treeId]/trash/actions";
import { Alert } from "@/components/ui";
import { trashUrl } from "@/lib/trash";

/**
 * Shown after a delete. It is the quickest way back from a mistake, and how people
 * learn where deleted things go.
 */
export function TrashedNotice({
  treeId,
  kind,
  id,
}: {
  treeId: string;
  kind: "media" | "person";
  id: string;
}) {
  return (
    <Alert className="mb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Moved to Trash.</span>
        <form action={kind === "media" ? restoreMediaAction : restorePersonAction}>
          <input type="hidden" name="treeId" value={treeId} />
          <input type="hidden" name={kind === "media" ? "mediaId" : "personId"} value={id} />
          <input type="hidden" name="after" value="item" />
          <button type="submit" className="font-medium underline">
            Undo
          </button>
        </form>
        <Link href={trashUrl(treeId, kind === "media" ? "media" : "people")} className="underline">
          Open Trash
        </Link>
      </div>
    </Alert>
  );
}
