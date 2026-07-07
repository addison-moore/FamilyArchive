"use client";

import { useRef, useState, useTransition } from "react";

import type { FaceBox } from "@/lib/faces";

interface PersonOption {
  id: string;
  fullName: string;
}

interface DraftBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Facebook-style photo tagging (PRD §17.1): face boxes overlaid on the photo;
 * click a box to assign a person or remove it; "Add face box" lets
 * contributors drag to draw a missing one. Read-only for viewers.
 */
export function FaceTagger({
  imageUrl,
  alt,
  faces,
  people,
  canTag,
  assignAction,
  removeAction,
  addAction,
  hiddenFields,
}: {
  imageUrl: string;
  alt: string;
  faces: FaceBox[];
  people: PersonOption[];
  canTag: boolean;
  assignAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  addAction: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DraftBox | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = faces.find((f) => f.id === selectedId) ?? null;

  const withHidden = (extra: Record<string, string>): FormData => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...hiddenFields, ...extra })) {
      data.set(key, value);
    }
    return data;
  };

  const relativePoint = (event: React.PointerEvent): { x: number; y: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!drawMode) return;
    const point = relativePoint(event);
    if (!point) return;
    event.preventDefault();
    setDragStart(point);
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drawMode || !dragStart) return;
    const point = relativePoint(event);
    if (!point) return;
    setDraft({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    });
  };

  const onPointerUp = () => {
    if (!drawMode || !draft) return;
    setDragStart(null);
    if (draft.width < 0.01 || draft.height < 0.01) setDraft(null);
  };

  const pct = (value: number) => `${value * 100}%`;

  return (
    <div>
      <div
        ref={containerRef}
        className={`relative inline-block max-w-full ${drawMode ? "cursor-crosshair" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-[70vh] rounded select-none"
          draggable={false}
        />
        {faces.map((face) => (
          <button
            key={face.id}
            type="button"
            title={face.personName ?? "Unidentified — click to tag"}
            onClick={() => {
              if (!drawMode) setSelectedId(face.id === selectedId ? null : face.id);
            }}
            className={`absolute rounded-sm border-2 ${
              face.id === selectedId
                ? "border-accent-600 bg-accent-600/10"
                : face.personId
                  ? "border-white/90 hover:border-accent-600"
                  : "border-dashed border-amber-400 hover:border-accent-600"
            }`}
            style={{
              left: pct(face.x),
              top: pct(face.y),
              width: pct(face.width),
              height: pct(face.height),
            }}
          >
            {face.personName && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white">
                {face.personName}
              </span>
            )}
          </button>
        ))}
        {draft && (
          <div
            className="absolute rounded-sm border-2 border-dashed border-accent-600 bg-accent-600/10"
            style={{
              left: pct(draft.x),
              top: pct(draft.y),
              width: pct(draft.width),
              height: pct(draft.height),
            }}
          />
        )}
      </div>

      {canTag && (
        <div className="mt-3 space-y-3">
          {selected && !drawMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-archive-100 bg-archive-50 p-3">
              <span className="text-sm">
                {selected.personName ? (
                  <>
                    Tagged as <strong>{selected.personName}</strong>
                  </>
                ) : (
                  "Who is this?"
                )}
              </span>
              <select
                defaultValue={selected.personId ?? ""}
                onChange={(event) => {
                  const personId = event.target.value;
                  startTransition(async () => {
                    await assignAction(withHidden({ faceId: selected.id, personId }));
                    setSelectedId(null);
                  });
                }}
                disabled={isPending}
                className="rounded-md border border-archive-100 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— unassigned —</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeAction(withHidden({ faceId: selected.id }));
                    setSelectedId(null);
                  })
                }
                className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Remove box
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDrawMode(!drawMode);
                setDraft(null);
                setSelectedId(null);
              }}
              className="rounded-md border border-archive-100 bg-white px-3 py-1.5 text-sm text-archive-700 hover:bg-archive-50"
            >
              {drawMode ? "Cancel drawing" : "Add face box"}
            </button>
            {drawMode && !draft && (
              <span className="text-xs text-archive-700/70">
                Drag on the photo to draw a box around a face.
              </span>
            )}
            {drawMode && draft && (
              <>
                <select
                  id="face-draft-person"
                  className="rounded-md border border-archive-100 bg-white px-2 py-1.5 text-sm"
                  defaultValue=""
                >
                  <option value="">— tag later —</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    const personId =
                      (document.getElementById("face-draft-person") as HTMLSelectElement | null)
                        ?.value ?? "";
                    const box = draft;
                    startTransition(async () => {
                      await addAction(
                        withHidden({
                          x: String(box.x),
                          y: String(box.y),
                          width: String(box.width),
                          height: String(box.height),
                          personId,
                        }),
                      );
                      setDraft(null);
                      setDrawMode(false);
                    });
                  }}
                  className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600/90"
                >
                  Save box
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
