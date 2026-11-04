import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Page-level building blocks, alongside the field and button styles in form.tsx.
 *
 * Heading sizes across the app: a page's h1 is text-2xl in a PageHeader, sections
 * are h2 text-lg and groups h3 text-sm. Two places use a text-xl h1 because the
 * page is a single card or a viewer rather than a document: the signed-out pages
 * and the empty archive card, and a media item's caption.
 */

/**
 * A page's title row. `children` sit in the row beside the title, such as a
 * segmented toggle; `actions` sit at the far end and wrap under it when narrow.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere]">{title}</h1>
        {children}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <div className="mt-1 text-sm text-archive-700">{description}</div>}
    </div>
  );
}

const ALERT_TONES = {
  info: "border-accent-600/30 bg-archive-100/60 text-archive-800",
  success: "border-success-strong/30 bg-success-soft text-success-strong",
  warn: "border-warn-line bg-warn-soft text-warn",
  danger: "border-danger-line bg-danger-soft text-danger",
};

/** A message about the page or the last action. */
export function Alert({
  tone = "info",
  className = "",
  children,
}: {
  tone?: keyof typeof ALERT_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-sm ${ALERT_TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-archive-100 text-archive-700",
  warn: "bg-warn-soft text-warn",
  success: "bg-success-soft text-success-strong",
  danger: "bg-danger-soft text-danger",
};

/**
 * A short status or role label. It has no display of its own, so a caller's
 * `hidden` holds: inline-block would win over it by Tailwind's ordering. A span's
 * vertical padding overflows its line without affecting layout, which is what a
 * label inside a run of text wants anyway.
 */
export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export const segmentGroupClass =
  "inline-flex rounded-md border border-archive-200 bg-surface p-0.5 text-sm";

export function segmentClass(active: boolean): string {
  return `rounded px-3 py-1.5 whitespace-nowrap no-underline ${
    active ? "bg-archive-100 font-medium text-archive-900" : "text-archive-700 hover:bg-archive-50"
  }`;
}

/** A segmented toggle whose options are links, 38px tall like the fields beside it. */
export function SegmentedLinks({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: ReactNode; active: boolean; title?: string }[];
}) {
  return (
    <nav aria-label={label} className={segmentGroupClass}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.title}
          aria-current={item.active ? "true" : undefined}
          className={segmentClass(item.active)}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** The arrow on a dropdown, matching the one on selects. */
export function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-archive-700"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
