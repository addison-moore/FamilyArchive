"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A <details> dropdown that also closes on an outside click or Escape. The
 * native element only closes when its own summary is clicked again, which
 * leaves the panel hanging open while the user works elsewhere on the page.
 *
 * Children supply their own panel element, so callers keep control of the
 * popover's positioning and width.
 */
export function Dropdown({
  summary,
  className,
  summaryClassName,
  children,
}: {
  summary: ReactNode;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    // pointerdown rather than click: the menu should be gone before whatever
    // was clicked underneath it reacts.
    const onPointerDown = (event: PointerEvent) => {
      if (!details.open) return;
      if (event.target instanceof Node && details.contains(event.target)) return;
      details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) details.open = false;
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  );
}
