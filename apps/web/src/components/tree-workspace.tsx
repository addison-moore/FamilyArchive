"use client";

import { useState, type ReactNode } from "react";

import { TreeCanvas } from "@/components/tree-canvas";
import type { TreeGraphPayload } from "@/lib/tree-visibility";

/**
 * The tree page's workspace: canvas and person sidebar as one panel.
 *
 * They share a single border and a divider rather than sitting in two detached
 * cards, so the sidebar reads as part of the same surface the canvas lives on.
 * The panel fills whatever height the page gives it — `min-h-0` at every level
 * is what lets a flex child shrink below its content so the canvas resolves
 * against the viewport instead of the graph's own size.
 *
 * Wide hides the sidebar entirely and gives the canvas the whole panel; the
 * sidebar returns on toggle. Below xl the sidebar stacks under the canvas,
 * where a fixed canvas height reads better than a squeezed split.
 *
 * The sidebar halves arrive as slots because they are server-rendered; keeping
 * them as props is what lets this stay a thin client wrapper. It also means the
 * chosen layout survives the soft navigation a node click triggers, instead of
 * resetting on every selection.
 */
export function TreeWorkspace({
  treeId,
  graph,
  selectedId,
  summary,
  actions,
}: {
  treeId: string;
  graph: TreeGraphPayload;
  selectedId: string | null;
  summary: ReactNode;
  actions: ReactNode;
}) {
  const [wide, setWide] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-archive-100 bg-surface shadow-sm xl:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Remount when the starting person changes. Collapse flags are seeded
            once from the payload's generations, which buildTreeGraph recomputes
            relative to the new start — carrying them over left the canvas
            collapsed along meaningless boundaries, sometimes hiding the new
            start's entire ancestor line. Keyed on startId only, so the flags
            still survive plain selection clicks and mode switches. */}
        <TreeCanvas
          key={graph.startId}
          treeId={treeId}
          graph={graph}
          selectedId={selectedId}
          wide={wide}
          onToggleWide={() => setWide((current) => !current)}
        />
      </div>
      {!wide && (
        <aside className="flex min-h-0 shrink-0 flex-col overflow-y-auto border-archive-100 xl:w-[22rem] xl:border-l 2xl:w-[26rem]">
          <div className="border-t border-archive-100 p-4 xl:border-t-0">{summary}</div>
          <div className="border-t border-archive-100 p-4">{actions}</div>
        </aside>
      )}
    </div>
  );
}
