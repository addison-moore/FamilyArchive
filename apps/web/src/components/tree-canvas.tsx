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
} from "@xyflow/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

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
      className={`flex w-[190px] items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md ${
        data.isSelected
          ? "border-accent-600 ring-2 ring-accent-600/30"
          : data.isStart
            ? "border-accent-600/60"
            : "border-archive-100"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-archive-700/40" />
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
      <Handle type="source" position={Position.Bottom} className="!bg-archive-700/40" />
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

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.kind === "partner" ? "straight" : "smoothstep",
        style:
          edge.kind === "partner"
            ? { stroke: "#b45309", strokeDasharray: "6 4", strokeWidth: 1.5 }
            : { stroke: "#6b5d4a", strokeWidth: 1.5 },
      })),
    [edges],
  );

  return (
    <div className="h-[70vh] min-h-[420px] rounded-xl border border-archive-100 bg-white shadow-sm">
      <ReactFlow
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
        <Background gap={24} color="#e5ddd0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
