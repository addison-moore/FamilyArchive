"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DOC_SECTIONS } from "@/lib/docs-manifest";

function NavLinks() {
  const pathname = usePathname();
  const linkClass = (href: string) =>
    `block rounded px-2.5 py-1.5 text-sm no-underline ${
      pathname === href
        ? "bg-archive-100 font-medium text-archive-900"
        : "text-archive-700 hover:bg-archive-100/60 hover:text-archive-900"
    }`;

  return (
    <nav aria-label="Documentation">
      <Link href="/docs" className={linkClass("/docs")}>
        Overview
      </Link>
      {DOC_SECTIONS.map((section) => (
        <div key={section.label} className="mt-4">
          <div className="px-2.5 pb-1 text-xs font-semibold tracking-wide text-archive-700/70 uppercase">
            {section.label}
          </div>
          {section.entries.map((doc) => {
            const href = `/docs/${doc.slug.join("/")}`;
            return (
              <Link key={href} href={href} className={linkClass(href)}>
                {doc.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar() {
  return (
    <>
      {/* Mobile: collapsible menu above the content. */}
      <details className="mb-6 rounded-lg border border-archive-100 bg-surface lg:hidden">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-archive-900">
          Documentation menu
        </summary>
        <div className="border-t border-archive-100 p-2">
          <NavLinks />
        </div>
      </details>
      {/* Desktop: sticky sidebar. */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <NavLinks />
        </div>
      </aside>
    </>
  );
}
