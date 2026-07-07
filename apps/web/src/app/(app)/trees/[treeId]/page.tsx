import { requireTreeRole } from "@familyarchive/auth";
import { treeRoleAtLeast } from "@familyarchive/shared";
import Link from "next/link";

import { buttonClass, Card, FormError } from "@/components/form";
import { PersonSummary } from "@/components/person-summary";
import { TreeCanvas } from "@/components/tree-canvas";
import { TreeNodeActions } from "@/components/tree-node-actions";
import { getPerson, getRelationshipGraph } from "@/lib/people";
import {
  buildTreeGraph,
  isTreeViewMode,
  TREE_VIEW_MODES,
  type TreeViewMode,
} from "@/lib/tree-graph";
import { layoutTreeGraph } from "@/lib/tree-layout";
import { resolveStartingPerson } from "@/lib/tree-graph";

const MODE_LABELS: Record<TreeViewMode, string> = {
  both: "Ancestors & descendants",
  ancestors: "Ancestors",
  descendants: "Descendants",
};

/** Default tree page: the interactive family tree (PRD §7.4, §11). */
export default async function TreePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ selected?: string; mode?: string; error?: string }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const { selected, mode: modeRaw, error } = await searchParams;
  const mode: TreeViewMode = isTreeViewMode(modeRaw) ? modeRaw : "both";

  const startPerson = await resolveStartingPerson(user.id, treeId);

  if (!startPerson) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="mb-2 text-xl font-semibold">This tree is empty</h1>
          <p className="mb-4 text-sm text-archive-700">
            Add the first family member to start building the tree.
          </p>
          {treeRoleAtLeast(role, "editor") ? (
            <Link href={`/trees/${treeId}/people/new`} className={`${buttonClass} no-underline`}>
              Add the first person
            </Link>
          ) : (
            <p className="text-sm text-archive-700/70">
              Ask an editor or admin to add the first person.
            </p>
          )}
        </Card>
      </div>
    );
  }

  const graph = await buildTreeGraph(treeId, startPerson.id, mode);
  const canvas = layoutTreeGraph(graph, startPerson.id);

  const selectedPerson = (selected ? await getPerson(treeId, selected) : null) ?? startPerson;
  const selectedGraph = await getRelationshipGraph(treeId, selectedPerson.id);

  const modeQuery = (m: TreeViewMode) => {
    const params = new URLSearchParams();
    if (m !== "both") params.set("mode", m);
    if (selectedPerson.id !== startPerson.id) params.set("selected", selectedPerson.id);
    const query = params.toString();
    return `/trees/${treeId}${query ? `?${query}` : ""}`;
  };

  return (
    <div>
      <FormError message={error} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-archive-100 bg-white p-0.5">
          {TREE_VIEW_MODES.map((m) => (
            <Link
              key={m}
              href={modeQuery(m)}
              className={`rounded px-3 py-1.5 text-sm no-underline ${
                m === mode
                  ? "bg-archive-100 font-medium text-archive-900"
                  : "text-archive-700 hover:bg-archive-50"
              }`}
            >
              {MODE_LABELS[m]}
            </Link>
          ))}
        </div>
        <span className="text-sm text-archive-700/70">
          {canvas.nodes.length} people shown · starting from {startPerson.fullName}
        </span>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          <TreeCanvas
            treeId={treeId}
            nodes={canvas.nodes}
            edges={canvas.edges}
            selectedId={selectedPerson.id}
          />
        </div>
        <div className="w-full xl:w-96 xl:shrink-0">
          <PersonSummary
            treeId={treeId}
            person={selectedPerson}
            graph={selectedGraph}
            role={role}
          />
          <TreeNodeActions
            treeId={treeId}
            personId={selectedPerson.id}
            isStart={selectedPerson.id === startPerson.id}
            mode={mode}
            role={role}
          />
        </div>
      </div>
    </div>
  );
}
