"use client";

import { useState, type ReactNode } from "react";

import { TreeCanvas } from "@/components/tree-canvas";
import type { TreeGraphPayload } from "@/lib/tree-visibility";

/**
 * Layout shell for the tree page, and owner of the canvas's "wide" toggle.
 *
 * Default: the person sidebar sits beside the canvas from xl up. Wide: the
 * canvas takes the full content width and the sidebar moves below it, laid out
 * horizontally — summary next to the node actions.
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
    <div className={`flex flex-col gap-6 ${wide ? "" : "xl:flex-row"}`}>
      <div className="min-w-0 flex-1">
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
      <div className={wide ? "w-full" : "w-full xl:w-96 xl:shrink-0"}>
        <div className={wide ? "flex flex-col gap-4 xl:flex-row xl:items-start" : undefined}>
          {/* Held at the sidebar's own width even when wide, so the summary's
              measure stays readable instead of stretching across the page. */}
          <div className={wide ? "min-w-0 xl:w-96 xl:shrink-0" : undefined}>{summary}</div>
          <div className={wide ? "min-w-0 flex-1" : "mt-4"}>{actions}</div>
        </div>
      </div>
    </div>
  );
}
