"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

/**
 * Google-Photos-style lightbox navigation: chevron overlays on the stage edges
 * plus ←/→ keyboard shortcuts (suppressed while typing in a field).
 */
export function MediaNav({ prevUrl, nextUrl }: { prevUrl: string | null; nextUrl: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft" && prevUrl) router.push(prevUrl);
      if (event.key === "ArrowRight" && nextUrl) router.push(nextUrl);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevUrl, nextUrl, router]);

  const chevronClass =
    "absolute top-1/2 z-10 -translate-y-1/2 rounded-full border border-archive-100 " +
    "bg-surface/85 p-2.5 text-archive-700 shadow-sm backdrop-blur-sm no-underline " +
    "opacity-70 transition-opacity hover:opacity-100 hover:text-archive-900";

  return (
    <>
      {prevUrl && (
        <Link
          href={prevUrl}
          aria-label="Previous item"
          title="Previous (←)"
          className={`${chevronClass} left-3`}
        >
          <Chevron direction="left" />
        </Link>
      )}
      {nextUrl && (
        <Link
          href={nextUrl}
          aria-label="Next item"
          title="Next (→)"
          className={`${chevronClass} right-3`}
        >
          <Chevron direction="right" />
        </Link>
      )}
    </>
  );
}
