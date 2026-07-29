"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";

import { DOT_RADIUS, type CoupleFlowEdge, type FamilyFlowEdge } from "@/lib/tree-connectors";

// Edge paths arrive precomputed in `data` (buildConnectorEdges) and ignore the
// source/target coordinates React Flow passes in — valid only while
// nodesDraggable stays off. If dragging is ever enabled, recompute paths on
// drag or rebuild these on useInternalNode() so they track moving nodes.

const structuralStyle = {
  stroke: "var(--color-archive-700)",
  strokeWidth: 1.5,
  strokeLinecap: "square",
} as const;

const partnerOnlyStyle = {
  stroke: "var(--color-accent-600)",
  strokeWidth: 1.5,
  strokeDasharray: "6 4",
} as const;

function CoupleEdge({ id, data }: EdgeProps<CoupleFlowEdge>) {
  if (!data) return null;
  return (
    <>
      <BaseEdge
        id={id}
        path={data.path}
        style={data.variant === "partnerOnly" ? partnerOnlyStyle : structuralStyle}
      />
      {data.dotX !== null && data.dotY !== null && (
        <circle cx={data.dotX} cy={data.dotY} r={DOT_RADIUS} fill="var(--color-archive-700)" />
      )}
    </>
  );
}

function FamilyEdge({ id, data }: EdgeProps<FamilyFlowEdge>) {
  if (!data) return null;
  return <BaseEdge id={id} path={data.path} style={structuralStyle} />;
}

export const edgeTypes = { couple: CoupleEdge, family: FamilyEdge };
