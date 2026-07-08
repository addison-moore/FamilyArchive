"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CanvasEdge, CanvasNode } from "@/lib/tree-layout";

import "@xyflow/react/dist/style.css";

type PersonNodeData = {
  fullName: string;
  lifespan: string | null;
  isStart: boolean;
  isSelected: boolean;
};
type PersonFlowNode = Node<PersonNodeData, "person">;

function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  const initials = data.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={`flex w-[190px] items-center gap-2.5 rounded-lg border bg-surface-raised px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md ${
        data.isSelected
          ? "border-accent-600 ring-2 ring-accent-600/30"
          : data.isStart
            ? "border-accent-600/60"
            : "border-archive-100"
      }`}
    >
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
  nodes,
  edges,
  selectedId,
}: {
  treeId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [maximized, setMaximized] = useState(false);
  const flowRef = useRef<ReactFlowInstance<PersonFlowNode, Edge> | null>(null);

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

  const flowNodes = useMemo<PersonFlowNode[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: "person",
        position: { x: node.x, y: node.y },
        data: {
          fullName: node.fullName,
          lifespan: node.lifespan,
          isStart: node.isStart,
          isSelected: node.id === selectedId,
        },
      })),
    [nodes, selectedId],
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return edges.map((edge) => {
      if (edge.kind !== "partner") {
        // Parent → child: always out the bottom of the parent, into the top of
        // the child (pinned by handle id — see PersonNode).
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: "bottom",
          targetHandle: "top",
          type: "smoothstep",
          style: { stroke: "var(--color-archive-700)", strokeWidth: 1.5 },
        };
      }
      // Partner edges connect side-to-side. Whichever node sits further left
      // sends the line out of its right handle into the other node's left
      // handle, regardless of which end is "source" in the data. Partners on
      // the same row get a clean straight line; a cross-row pair (a partner
      // ranked into a different generation by their own parents) gets a
      // stepped route instead of a long diagonal slash.
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const [left, right] =
        (sourceNode?.x ?? 0) <= (targetNode?.x ?? 0)
          ? [sourceNode, targetNode]
          : [targetNode, sourceNode];
      const sameRow = Math.abs((left?.y ?? 0) - (right?.y ?? 0)) < 8;
      return {
        id: edge.id,
        source: left?.id ?? edge.source,
        target: right?.id ?? edge.target,
        sourceHandle: "right-source",
        targetHandle: "left-target",
        type: sameRow ? "straight" : "smoothstep",
        style: { stroke: "var(--color-accent-600)", strokeDasharray: "6 4", strokeWidth: 1.5 },
      };
    });
  }, [edges, nodes]);

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
            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
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
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        )}
      </button>
      <ReactFlow
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
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
