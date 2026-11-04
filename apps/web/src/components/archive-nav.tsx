"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const linkClass = "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap no-underline";

function NavLinks({ root, items }: { root: string; items: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return items.map((item) => {
    // The tree is the archive's root, so every other page sits under its path.
    const active =
      item.href === root
        ? pathname === root
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`${linkClass} ${
          active
            ? "bg-archive-100 font-medium text-archive-900"
            : "text-archive-700 hover:bg-archive-100"
        }`}
      >
        {item.label}
      </Link>
    );
  });
}

/**
 * The archive's sections, inside the header bar on wide screens. It keeps its
 * width, so when the bar is tight it's the archive and account names that truncate.
 */
export function HeaderNav(props: { root: string; items: { label: string; href: string }[] }) {
  return (
    <nav aria-label="Archive navigation" className="hidden shrink-0 items-center gap-0.5 lg:flex">
      <NavLinks {...props} />
    </nav>
  );
}

/**
 * The same links on narrow screens, as one row that scrolls sideways rather than
 * wrapping and pushing the page down. The current section starts in view.
 */
export function RowNav(props: { root: string; items: { label: string; href: string }[] }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const nav = ref.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && current) nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 16;
  }, [pathname]);

  return (
    <nav
      ref={ref}
      aria-label="Archive navigation"
      className="flex items-center gap-1 overflow-x-auto border-b border-archive-100 px-4 py-2 [scrollbar-width:none] lg:hidden"
    >
      <NavLinks {...props} />
    </nav>
  );
}
