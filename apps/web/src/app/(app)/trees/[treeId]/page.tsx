import { requireTreeRole } from "@familyarchive/auth";
import { treeRoleAtLeast } from "@familyarchive/shared";
import Link from "next/link";

import { buttonClass, Card, FormError } from "@/components/form";
import { PersonSummary, personLifespan } from "@/components/person-summary";
import { TreeNodeActions } from "@/components/tree-node-actions";
import { TreeWorkspace } from "@/components/tree-workspace";
import { profilePhotoUrl } from "@/lib/media";
import { getPerson, getRelationshipGraph } from "@/lib/people";
import {
  buildTreeGraph,
  isTreeViewMode,
  TREE_VIEW_MODES,
  type TreeViewMode,
} from "@/lib/tree-graph";
import { resolveStartingPerson } from "@/lib/tree-graph";
import type { TreeGraphPayload } from "@/lib/tree-visibility";

const MODE_LABELS: Record<TreeViewMode, string> = {
  both: "Ancestors & descendants",
  ancestors: "Ancestors",
  descendants: "Descendants",
};

/** Default tree page: the interactive family tree. */
export default async function TreePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{
    selected?: string;
    mode?: string;
    error?: string;
    imported?: string;
    people?: string;
    rels?: string;
    /** Count of import warnings; the messages live on the source record. */
    warn?: string;
  }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const { selected, mode: modeRaw, error, imported, people, rels, warn } = await searchParams;
  const mode: TreeViewMode = isTreeViewMode(modeRaw) ? modeRaw : "both";

  const startPerson = await resolveStartingPerson(user?.id ?? null, treeId);

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
  // Visibility and layout run client-side (collapsible branches); the page
  // ships only the plain graph data.
  const payload: TreeGraphPayload = {
    startId: startPerson.id,
    people: graph.people.map(({ person, generation }) => ({
      id: person.id,
      fullName: person.fullName,
      lifespan: personLifespan(person),
      generation,
      verified: person.verified,
    })),
    parentEdges: graph.parentEdges.map((e) => ({
      id: e.id,
      from: e.fromPersonId,
      to: e.toPersonId,
    })),
    partnerEdges: graph.partnerEdges.map((e) => ({
      id: e.id,
      from: e.fromPersonId,
      to: e.toPersonId,
    })),
  };

  const selectedPerson = (selected ? await getPerson(treeId, selected) : null) ?? startPerson;
  const [selectedGraph, selectedPhotoUrl] = await Promise.all([
    getRelationshipGraph(treeId, selectedPerson.id),
    profilePhotoUrl(treeId, selectedPerson.profileMediaId),
  ]);

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
      {imported && (
        <div className="mb-4 rounded-md border border-accent-600/30 bg-archive-100/60 px-4 py-3 text-sm text-archive-800">
          GEDCOM import complete: {people ?? "?"} people and {rels ?? "?"} relationships.{" "}
          {warn && (
            <span className="text-warn">
              {warn} warning{warn === "1" ? "" : "s"} were recorded for this import.{" "}
            </span>
          )}
          {treeRoleAtLeast(role, "editor") && (
            <Link href={`/trees/${treeId}/duplicates`} className="text-accent-600 hover:underline">
              Review possible duplicates
            </Link>
          )}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-archive-100 bg-surface p-0.5">
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
        <span className="text-sm text-archive-700/70">starting from {startPerson.fullName}</span>
      </div>

      <TreeWorkspace
        treeId={treeId}
        graph={payload}
        selectedId={selectedPerson.id}
        summary={
          <PersonSummary
            treeId={treeId}
            person={selectedPerson}
            graph={selectedGraph}
            role={role}
            photoUrl={selectedPhotoUrl}
          />
        }
        actions={
          user && (
            <TreeNodeActions
              treeId={treeId}
              personId={selectedPerson.id}
              isStart={selectedPerson.id === startPerson.id}
              mode={mode}
              role={role}
            />
          )
        }
      />
    </div>
  );
}
