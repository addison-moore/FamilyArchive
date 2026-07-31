"use client";

import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  sameCollapseView,
  visibleSubgraph,
  type CollapseDirection,
  type CollapseMap,
  type TreeGraphPayload,
} from "@/lib/tree-visibility";

import "@xyflow/react/dist/style.css";

const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

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

/** Every control in the cluster shares this box so the group reads as one
 *  segmented control. `flex`/`hidden` stay out of it: an element must never
 *  carry both, since their precedence comes from Tailwind's own ordering
 *  rather than the order written here. */
const controlButtonClass =
  "h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-l border-archive-100 " +
  "text-archive-700 first:border-l-0 hover:bg-archive-100 disabled:cursor-not-allowed " +
  "disabled:opacity-40 disabled:hover:bg-transparent";

function ControlIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * The canvas's whole control surface, unified at the bottom right: zoom out,
 * zoom in, fit, wide, full screen.
 *
 * Zoom is read from the React Flow store here rather than in TreeCanvas so a
 * pan/zoom gesture only re-renders these five buttons — subscribing higher up
 * would re-render the node graph on every frame.
 */
function CanvasControls({
  wide,
  onToggleWide,
  maximized,
  onToggleMaximized,
}: {
  wide: boolean;
  onToggleWide: () => void;
  maximized: boolean;
  onToggleMaximized: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);

  // `shrink-0` below is load-bearing. `overflow-hidden` makes the group a
  // scroll container, which zeroes its automatic minimum size — so on a narrow
  // canvas the rail would shrink it and clip its own trailing buttons,
  // including the only way out of full screen on a touch device (no Esc key).
  // The status pill carries `min-w-0` and wraps instead.
  return (
    <div
      role="group"
      aria-label="Tree canvas controls"
      className="pointer-events-auto flex shrink-0 items-stretch overflow-hidden rounded-md border border-archive-100 bg-surface-raised shadow-sm"
    >
      <button
        type="button"
        onClick={() => void zoomOut({ duration: 200 })}
        disabled={zoom <= minZoom}
        title="Zoom out"
        aria-label="Zoom out"
        className={`flex ${controlButtonClass}`}
      >
        <ControlIcon>
          <line x1="5" y1="12" x2="19" y2="12" />
        </ControlIcon>
      </button>
      <button
        type="button"
        onClick={() => void zoomIn({ duration: 200 })}
        disabled={zoom >= maxZoom}
        title="Zoom in"
        aria-label="Zoom in"
        className={`flex ${controlButtonClass}`}
      >
        <ControlIcon>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </ControlIcon>
      </button>
      <button
        type="button"
        onClick={() => void fitView({ ...FIT_VIEW_OPTIONS, duration: 300 })}
        title="Fit tree to view"
        aria-label="Fit tree to view"
        className={`flex ${controlButtonClass}`}
      >
        {/* Corner brackets — deliberately distinct from the diagonal arrows on
            the full-screen control at the end of the group. */}
        <ControlIcon>
          <polyline points="4 9 4 4 9 4" />
          <polyline points="15 4 20 4 20 9" />
          <polyline points="20 15 20 20 15 20" />
          <polyline points="9 20 4 20 4 15" />
        </ControlIcon>
      </button>
      {/* Below xl the sidebar already sits under the canvas, so widening would
          be a no-op — the control only exists where it changes something. */}
      {!maximized && (
        <button
          type="button"
          onClick={onToggleWide}
          title={wide ? "Restore sidebar beside the tree" : "Expand tree to full width"}
          aria-label={wide ? "Restore sidebar beside the tree" : "Expand tree to full width"}
          aria-pressed={wide}
          className={`hidden xl:flex ${controlButtonClass}`}
        >
          {wide ? (
            <ControlIcon>
              <line x1="3" y1="12" x2="21" y2="12" />
              <polyline points="7 8 11 12 7 16" />
              <polyline points="17 8 13 12 17 16" />
            </ControlIcon>
          ) : (
            <ControlIcon>
              <line x1="3" y1="12" x2="21" y2="12" />
              <polyline points="7 8 3 12 7 16" />
              <polyline points="17 8 21 12 17 16" />
            </ControlIcon>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onToggleMaximized}
        title={maximized ? "Exit full screen (Esc)" : "Full screen"}
        aria-label={maximized ? "Exit full screen" : "Full screen"}
        aria-pressed={maximized}
        className={`flex ${controlButtonClass}`}
      >
        {maximized ? (
          <ControlIcon>
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </ControlIcon>
        ) : (
          <ControlIcon>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </ControlIcon>
        )}
      </button>
    </div>
  );
}

function TreeCanvasInner({
  treeId,
  graph,
  selectedId,
  wide,
  onToggleWide,
}: {
  treeId: string;
  graph: TreeGraphPayload;
  selectedId: string | null;
  wide: boolean;
  onToggleWide: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [maximized, setMaximized] = useState(false);
  const { fitView } = useReactFlow<PersonFlowNode, ConnectorFlowEdge>();

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

  const refit = useCallback(() => {
    setTimeout(() => void fitView({ ...FIT_VIEW_OPTIONS, duration: 300 }), 60);
  }, [fitView]);

  const onToggleBranch = useCallback(
    (personId: string, direction: CollapseDirection, expand: boolean) => {
      setCollapsed((current) =>
        expand
          ? expandBranch(adjacency, current, personId, direction)
          : collapseBranch(current, personId, direction),
      );
      refit();
    },
    [adjacency, refit],
  );

  // Both view toggles resize the container, so re-fit once the new layout has
  // painted. Skipped on mount, where ReactFlow's own `fitView` prop covers it.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    refit();
  }, [wide, maximized, refit]);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMaximized(false);
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
  // Content comparison, not `collapsed !== defaults`: `defaults` is re-memoised
  // whenever the graph payload object changes, and the server hands over a fresh
  // payload on every soft navigation — so identity would offer "Reset view"
  // after any node click even with the view still sitting at the defaults.
  const canReset = Object.keys(defaults).length > 0 && !sameCollapseView(collapsed, defaults);

  return (
    <div
      className={
        maximized
          ? "fixed inset-0 z-50 bg-surface"
          : "relative h-[70vh] min-h-[420px] rounded-xl border border-archive-100 bg-surface shadow-sm"
      }
    >
      {/* One bottom rail: visibility status on the left, controls on the right.
          Sharing a flex row is what keeps them from overlapping on a narrow
          canvas, which a centred status pill could not guarantee. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-2">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-archive-100 bg-surface-raised px-3 py-1.5 text-xs text-archive-700 shadow-sm">
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
        <CanvasControls
          wide={wide}
          onToggleWide={onToggleWide}
          maximized={maximized}
          onToggleMaximized={() => setMaximized((current) => !current)}
        />
      </div>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
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
      </ReactFlow>
    </div>
  );
}

export function TreeCanvas(props: {
  treeId: string;
  graph: TreeGraphPayload;
  selectedId: string | null;
  wide: boolean;
  onToggleWide: () => void;
}) {
  // The provider lets the control cluster live outside <ReactFlow> — as a
  // sibling overlay — while still reaching the viewport helpers and store.
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
