import { getSessionUser, getTreeRole } from "@familyarchive/auth";
import { getDb, trees } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { Dropdown } from "@/components/dropdown";
import { getAccessibleTrees } from "@/lib/trees";

/** Tree-level navigation. */
const ACTIVE_NAV = [
  { label: "Tree", path: "" },
  { label: "People", path: "people" },
  { label: "Media", path: "media" },
  { label: "Collections", path: "collections" },
  { label: "Search", path: "search" },
  { label: "Suggestions", path: "suggestions" },
] as const;

/** Search-engine indexing is opt-in even for public archives. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ treeId: string }>;
}): Promise<Metadata> {
  const { treeId } = await params;
  const rows = await getDb()
    .select({ isPublic: trees.isPublic, allowIndexing: trees.allowIndexing })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);
  const tree = rows[0];
  const indexable = Boolean(tree?.isPublic && tree.allowIndexing);
  return { robots: indexable ? { index: true, follow: true } : { index: false, follow: false } };
}

export default async function TreeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;
  const user = await getSessionUser();

  const treeRows = await getDb().select().from(trees).where(eq(trees.id, treeId)).limit(1);
  const tree = treeRows[0];
  if (!tree) notFound();

  // Members get their role. Non-members — signed in or not — get read-only
  // access to a public archive; anything else is a 404 for a signed-in visitor
  // and a login redirect for an anonymous one. Signing in must never take
  // access away, which it did while the public branch was anonymous-only.
  const memberRole = user ? await getTreeRole(user, treeId) : null;
  let role: string;
  let accessibleTrees: { id: string; name: string }[];
  if (memberRole) {
    role = memberRole;
    accessibleTrees = await getAccessibleTrees(user!);
  } else {
    if (!tree.isPublic) {
      if (user) notFound();
      redirect("/login");
    }
    role = "viewer";
    accessibleTrees = user
      ? [...(await getAccessibleTrees(user)), { id: tree.id, name: tree.name }].filter(
          (item, index, all) => all.findIndex((other) => other.id === item.id) === index,
        )
      : [{ id: tree.id, name: tree.name }];
  }

  const navLinks = (
    <nav aria-label="Archive navigation" className="hidden min-w-0 items-center gap-0.5 lg:flex">
      {ACTIVE_NAV.map((item) => (
        <Link
          key={item.label}
          href={item.path ? `/trees/${treeId}/${item.path}` : `/trees/${treeId}`}
          className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-archive-700 no-underline hover:bg-archive-100"
        >
          {item.label}
        </Link>
      ))}
      {role === "admin" && (
        <Link
          href={`/trees/${treeId}/settings`}
          className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-archive-700 no-underline hover:bg-archive-100"
        >
          Settings
        </Link>
      )}
    </nav>
  );

  const archiveSwitcher = (
    <Dropdown
      className="relative min-w-0 shrink"
      summaryClassName="flex cursor-pointer list-none items-center gap-1 rounded-md border border-archive-100 px-2.5 py-1.5 text-sm font-medium hover:bg-archive-50"
      summary={
        <>
          <span className="max-w-[12rem] truncate">{tree.name}</span>
          <span className="shrink-0 text-xs text-archive-700/50">▾</span>
        </>
      }
    >
      <div className="absolute left-0 z-10 mt-1 w-64 rounded-md border border-archive-100 bg-surface p-1 shadow-md">
        {accessibleTrees.map((item) => (
          <Link
            key={item.id}
            href={`/trees/${item.id}`}
            className={`block rounded px-3 py-2 text-sm no-underline hover:bg-archive-50 ${
              item.id === treeId ? "font-semibold" : ""
            }`}
          >
            {item.name}
          </Link>
        ))}
        {user && (
          <Link
            href="/trees"
            className="block rounded border-t border-archive-100 px-3 py-2 text-sm text-archive-700/80 no-underline hover:bg-archive-50"
          >
            All archives…
          </Link>
        )}
      </div>
    </Dropdown>
  );

  return (
    <>
      <AppHeader
        nav={
          <div className="flex min-w-0 items-center gap-2">
            {archiveSwitcher}
            {navLinks}
          </div>
        }
        trailing={
          <span className="hidden shrink-0 rounded bg-archive-100 px-2 py-0.5 text-xs text-archive-700 md:inline">
            {user ? `your role: ${role}` : "public archive — read-only"}
          </span>
        }
      />
      {/* Narrow screens lose the in-header nav, so it reappears as its own row
          rather than being unreachable. */}
      <nav
        aria-label="Archive navigation"
        className="flex flex-wrap items-center gap-1 border-b border-archive-100 px-4 py-2 lg:hidden"
      >
        {ACTIVE_NAV.map((item) => (
          <Link
            key={item.label}
            href={item.path ? `/trees/${treeId}/${item.path}` : `/trees/${treeId}`}
            className="rounded-md px-2.5 py-1.5 text-sm text-archive-700 no-underline hover:bg-archive-100"
          >
            {item.label}
          </Link>
        ))}
        {role === "admin" && (
          <Link
            href={`/trees/${treeId}/settings`}
            className="rounded-md px-2.5 py-1.5 text-sm text-archive-700 no-underline hover:bg-archive-100"
          >
            Settings
          </Link>
        )}
      </nav>
      {/* The height chain the canvas page relies on: min-h-0 lets a flex child
          shrink below its content so `flex-1` resolves against the viewport
          instead of the graph's own size. */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-6">{children}</div>
    </>
  );
}
