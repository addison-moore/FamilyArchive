"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { edgeTypes } from "@/components/tree-edges";
import { buildConnectorEdges, type ConnectorFlowEdge } from "@/lib/tree-connectors";
import { layoutTreeGraph } from "@/lib/tree-layout";
import {
  buildAdjacency,
  collapseBranch,
  computeVisibleSet,
  defaultCollapseMap,
  expandBranch,
  hiddenBeyond,
  visibleSubgraph,
  type CollapseDirection,
  type CollapseMap,
  type TreeGraphPayload,
} from "@/lib/tree-visibility";

import "@xyflow/react/dist/style.css";

/** Branch toggle shown on a node edge: an expand pill with a hidden count, a
 * hover-revealed collapse control, or nothing. */
type BranchChip = { hiddenCount: number } | "collapsible" | null;

type PersonNodeData = {
  fullName: string;
  lifespan: string | null;
  isStart: boolean;
  isSelected: boolean;
  up: BranchChip;
  down: BranchChip;
  onToggleBranch: (personId: string, direction: CollapseDirection, expand: boolean) => void;
};
type PersonFlowNode = Node<PersonNodeData, "person">;

function BranchToggle({
  personId,
  direction,
  chip,
  fullName,
  onToggle,
}: {
  personId: string;
  direction: CollapseDirection;
  chip: BranchChip;
  fullName: string;
  onToggle: PersonNodeData["onToggleBranch"];
}) {
  if (!chip) return null;
  const relatives = direction === "up" ? "ancestors" : "descendants";
  const edgeClass = direction === "up" ? "-top-3" : "-bottom-3";
  if (chip === "collapsible") {
    return (
      <button
        type="button"
        aria-label={`Hide ${relatives} of ${fullName}`}
        title={`Hide ${relatives}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(personId, direction, false);
        }}
        className={`nodrag nopan absolute ${edgeClass} left-1/2 z-10 -translate-x-1/2 rounded-full border border-archive-100 bg-surface-raised px-1 text-archive-700/70 opacity-0 shadow-sm transition-opacity hover:bg-archive-100 focus-visible:opacity-100 group-hover:opacity-100`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line
            x1="2"
            y1="5"
            x2="8"
            y2="5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Show ${chip.hiddenCount} hidden ${relatives} of ${fullName}`}
      title={`Show ${chip.hiddenCount} more`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(personId, direction, true);
      }}
      className={`nodrag nopan absolute ${edgeClass} left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-accent-600/40 bg-surface-raised px-1.5 py-px text-[10px] font-semibold text-accent-600 shadow-sm hover:bg-archive-100`}
    >
      <span aria-hidden="true" className="text-[8px] leading-none">
        {direction === "up" ? "▲" : "▼"}
      </span>
      {chip.hiddenCount}
    </button>
  );
}

function PersonNode({ id, data }: NodeProps<PersonFlowNode>) {
  const initials = data.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    // h-[76px] must equal tree-layout's NODE_HEIGHT: connector paths are
    // precomputed from it, so card edges and line endpoints have to agree.
    <div
      className={`group relative flex h-[76px] w-[190px] items-center gap-2.5 rounded-lg border bg-surface-raised px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md ${
        data.isSelected
          ? "border-accent-600 ring-2 ring-accent-600/30"
          : data.isStart
            ? "border-accent-600/60"
            : "border-archive-100"
      }`}
    >
      <BranchToggle
        personId={id}
        direction="up"
        chip={data.up}
        fullName={data.fullName}
        onToggle={data.onToggleBranch}
      />
      <BranchToggle
        personId={id}
        direction="down"
        chip={data.down}
        fullName={data.fullName}
        onToggle={data.onToggleBranch}
      />
      {/* Explicit handle ids matter: edges pin themselves to a handle by id, and
          React Flow otherwise falls back to the FIRST handle of that type in DOM
          order — which would route parent-child edges out of a side handle.
          Top/bottom = parent-child; left/right = partner edges only. */}
      <Handle type="target" position={Position.Top} id="top" className="!bg-archive-700/40" />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!bg-archive-700/40"
        style={{ top: "50%" }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="!bg-archive-700/40"
        style={{ top: "50%" }}
      />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-archive-100 text-sm font-semibold text-archive-700">
        {initials || "?"}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-archive-900">{data.fullName}</div>
        {data.lifespan && (
          <div className="truncate text-xs text-archive-700/70">{data.lifespan}</div>
        )}
        {data.isStart && <div className="text-[10px] text-accent-600">starting person</div>}
      </div>
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="!bg-archive-700/40"
        style={{ top: "50%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!bg-archive-700/40"
        style={{ top: "50%" }}
      />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-archive-700/40" />
    </div>
  );
}

const nodeTypes = { person: PersonNode };

export function TreeCanvas({
  treeId,
  graph,
  selectedId,
}: {
  treeId: string;
  graph: TreeGraphPayload;
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [maximized, setMaximized] = useState(false);
  const flowRef = useRef<ReactFlowInstance<PersonFlowNode, ConnectorFlowEdge> | null>(null);

  const adjacency = useMemo(() => buildAdjacency(graph), [graph]);
  const defaults = useMemo(() => defaultCollapseMap(graph, adjacency), [graph, adjacency]);
  // Ephemeral per visit: survives selection clicks and mode switches (the
  // component stays mounted across those soft navigations), resets on reload.
  const [collapsed, setCollapsed] = useState<CollapseMap>(defaults);

  const visible = useMemo(
    () => computeVisibleSet(graph, adjacency, collapsed),
    [graph, adjacency, collapsed],
  );
  const canvas = useMemo(
    () => layoutTreeGraph(visibleSubgraph(graph, visible), graph.startId),
    [graph, visible],
  );

  const refit = () => {
    setTimeout(() => flowRef.current?.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 60);
  };

  const onToggleBranch = useCallback(
    (personId: string, direction: CollapseDirection, expand: boolean) => {
      setCollapsed((current) =>
        expand
          ? expandBranch(adjacency, current, personId, direction)
          : collapseBranch(current, personId, direction),
      );
      refit();
    },
    [adjacency],
  );

  // Re-fit after the container changes size, and let Escape exit full screen.
  const toggleMaximized = () => {
    setMaximized((current) => !current);
    setTimeout(() => flowRef.current?.fitView({ padding: 0.2, maxZoom: 1 }), 60);
  };
  useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggleMaximized();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const flowNodes = useMemo<PersonFlowNode[]>(() => {
    const chipFor = (personId: string, direction: CollapseDirection): BranchChip => {
      if (collapsed[personId]?.[direction]) {
        const count = hiddenBeyond(adjacency, visible, personId, direction);
        if (count > 0) return { hiddenCount: count };
      }
      const neighbors =
        (direction === "up"
          ? adjacency.parentsOf.get(personId)
          : adjacency.childrenOf.get(personId)) ?? [];
      return neighbors.some((id) => visible.has(id)) ? "collapsible" : null;
    };
    return canvas.nodes.map((node) => ({
      id: node.id,
      type: "person",
      position: { x: node.x, y: node.y },
      data: {
        fullName: node.fullName,
        lifespan: node.lifespan,
        isStart: node.isStart,
        isSelected: node.id === selectedId,
        up: chipFor(node.id, "up"),
        down: chipFor(node.id, "down"),
        onToggleBranch,
      },
    }));
  }, [canvas.nodes, selectedId, collapsed, adjacency, visible, onToggleBranch]);

  const flowEdges = useMemo(() => buildConnectorEdges(canvas.nodes, canvas.edges), [canvas]);

  const total = graph.people.length;
  const anyCollapsed = visible.size < total;
  const canReset = Object.keys(defaults).length > 0 && collapsed !== defaults;

  return (
    <div
      className={
        maximized
          ? "fixed inset-0 z-50 bg-surface"
          : "relative h-[70vh] min-h-[420px] rounded-xl border border-archive-100 bg-surface shadow-sm"
      }
    >
      <button
        type="button"
        onClick={toggleMaximized}
        title={maximized ? "Exit full screen (Esc)" : "Full screen"}
        aria-label={maximized ? "Exit full screen" : "Full screen"}
        className="absolute top-3 right-3 z-10 rounded-md border border-archive-100 bg-surface-raised p-2 text-archive-700 shadow-sm hover:bg-archive-100"
      >
        {/* Diagonal in/out arrows — deliberately distinct from the corner-bracket
            "fit view" icon in React Flow's controls at the bottom left. */}
        {maximized ? (
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
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        ) : (
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
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </button>
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-archive-100 bg-surface-raised px-3 py-1.5 text-xs text-archive-700 shadow-sm">
        <span>
          Showing {visible.size} of {total} people
        </span>
        {anyCollapsed && (
          <button
            type="button"
            onClick={() => {
              setCollapsed({});
              refit();
            }}
            className="font-medium text-accent-600 hover:underline"
          >
            Expand all
          </button>
        )}
        {canReset && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(defaults);
              refit();
            }}
            className="font-medium text-accent-600 hover:underline"
          >
            Reset view
          </button>
        )}
      </div>
      <ReactFlow
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.15}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("selected", node.id);
          router.push(`/trees/${treeId}?${params.toString()}`, { scroll: false });
        }}
      >
        <Background gap={24} color="var(--color-archive-100)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
