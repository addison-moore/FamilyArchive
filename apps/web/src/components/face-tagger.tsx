"use client";

import { useRef, useState, useTransition } from "react";

import { buttonClass, dangerButtonClass, subtleButtonClass } from "@/components/form";
import { PersonPicker } from "@/components/person-picker";
import type { FaceBox } from "@/lib/faces";

interface DraftBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** New tag boxes are this fraction of the image's smaller edge, Facebook-sized. */
const CLICK_BOX_FRACTION = 0.22;

/**
 * Facebook-style photo tagging. Face boxes stay invisible until
 * the photo is hovered; clicking a detected box assigns a person; clicking
 * directly on an untagged face creates a new box there — no modes, no
 * drawing. Read-only for viewers.
 */
export function FaceTagger({
  imageUrl,
  alt,
  faces,
  treeId,
  canTag,
  assignAction,
  removeAction,
  addAction,
  hiddenFields,
}: {
  imageUrl: string;
  alt: string;
  faces: FaceBox[];
  treeId: string;
  canTag: boolean;
  assignAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  addAction: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  /** An empty `personId` leaves the box in place with nobody assigned. */
  const assign = (faceId: string, personId: string) => {
    startTransition(async () => {
      await assignAction(withHidden({ faceId, personId }));
      setSelectedId(null);
    });
  };

  /** Create a face box centered on the clicked spot ("click a face to tag"). */
  const onPhotoClick = (event: React.MouseEvent) => {
    if (!canTag) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = (event.clientX - rect.left) / rect.width;
    const clickY = (event.clientY - rect.top) / rect.height;
    const sidePx = CLICK_BOX_FRACTION * Math.min(rect.width, rect.height);
    const width = sidePx / rect.width;
    const height = sidePx / rect.height;
    setSelectedId(null);
    setDraft({
      x: Math.min(Math.max(clickX - width / 2, 0), 1 - width),
      y: Math.min(Math.max(clickY - height / 2, 0), 1 - height),
      width,
      height,
    });
  };

  const pct = (value: number) => `${value * 100}%`;

  // Boxes are hidden until the photo is hovered (Facebook behavior); a
  // selected box and any in-progress draft stay visible regardless.
  const boxVisibility = (visible: boolean) =>
    visible ? "opacity-100" : "opacity-0 group-hover/photo:opacity-100";

  return (
    <div>
      <div
        ref={containerRef}
        className={`group/photo relative inline-block max-w-full ${canTag ? "cursor-crosshair" : ""}`}
        onClick={onPhotoClick}
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
            onClick={(event) => {
              event.stopPropagation();
              setDraft(null);
              setSelectedId(face.id === selectedId ? null : face.id);
            }}
            className={`absolute rounded-sm border-2 transition-opacity ${boxVisibility(
              face.id === selectedId,
            )} ${
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
          {selected && (
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
              <PersonPicker
                // The panel stays mounted when the selection moves to another box, and
                // whatever was typed for the last face shouldn't carry over to this one.
                key={selected.id}
                treeId={treeId}
                ariaLabel={selected.personName ? "Change who this is" : "Who is this?"}
                placeholder={selected.personName ? "Change to…" : "Type a name…"}
                autoFocus
                disabled={isPending}
                onChange={(person) => {
                  if (person) assign(selected.id, person.id);
                }}
                className="w-64 max-w-full"
              />
              {selected.personId && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => assign(selected.id, "")}
                  className={subtleButtonClass}
                >
                  Unassign
                </button>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeAction(withHidden({ faceId: selected.id }));
                    setSelectedId(null);
                  })
                }
                className={dangerButtonClass}
              >
                Remove box
              </button>
            </div>
          )}

          {draft && (
            <form
              // A real form, so a name that was typed but never chosen is refused rather
              // than saved as an untagged box. Empty still means "tag later".
              onSubmit={(event) => {
                event.preventDefault();
                const personId = String(new FormData(event.currentTarget).get("personId") ?? "");
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
                });
              }}
              className="flex flex-wrap items-center gap-2 rounded-md border border-archive-100 bg-archive-50 p-3"
            >
              <span className="text-sm">Who is this?</span>
              <PersonPicker
                treeId={treeId}
                name="personId"
                ariaLabel="Who is this?"
                placeholder="Type a name, or tag later"
                autoFocus
                className="w-64 max-w-full"
              />
              <button type="submit" disabled={isPending} className={buttonClass}>
                Save tag
              </button>
              <button type="button" onClick={() => setDraft(null)} className={subtleButtonClass}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
