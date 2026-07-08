import { getSessionUser, getTreeRole } from "@familyarchive/auth";
import { getDb, trees } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getAccessibleTrees } from "@/lib/trees";

/** Tree-level navigation (PRD §7.3). */
const ACTIVE_NAV = [
  { label: "Tree", path: "" },
  { label: "People", path: "people" },
  { label: "Media", path: "media" },
  { label: "Collections", path: "collections" },
  { label: "Search", path: "search" },
  { label: "Suggestions", path: "suggestions" },
] as const;

/** Search-engine indexing is opt-in even for public archives (PRD §23.3). */
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

  // Members get their role; anonymous visitors get read-only access to public
  // archives (PRD §23) and a login redirect everywhere else.
  let role: string;
  let accessibleTrees: { id: string; name: string }[];
  if (user) {
    const memberRole = await getTreeRole(user, treeId);
    if (!memberRole) notFound();
    role = memberRole;
    accessibleTrees = await getAccessibleTrees(user);
  } else {
    if (!tree.isPublic) redirect("/login");
    role = "viewer";
    accessibleTrees = [{ id: tree.id, name: tree.name }];
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-archive-100 pb-4">
        <details className="relative">
          <summary className="cursor-pointer list-none text-xl font-semibold hover:text-accent-600">
            {tree.name} <span className="text-sm text-archive-700/50">▾</span>
          </summary>
          <div className="absolute z-10 mt-1 w-64 rounded-md border border-archive-100 bg-surface p-1 shadow-md">
            {accessibleTrees.map((item) => (
              <Link
                key={item.id}
                href={`/trees/${item.id}`}
                className={`block rounded px-3 py-2 text-sm hover:bg-archive-50 ${
                  item.id === treeId ? "font-semibold" : ""
                }`}
              >
                {item.name}
              </Link>
            ))}
            {user && (
              <Link
                href="/trees"
                className="block rounded border-t border-archive-100 px-3 py-2 text-sm text-archive-700/80 hover:bg-archive-50"
              >
                All archives…
              </Link>
            )}
          </div>
        </details>
        <nav aria-label="Tree navigation" className="flex flex-wrap items-center gap-1">
          {ACTIVE_NAV.map((item) => (
            <Link
              key={item.label}
              href={item.path ? `/trees/${treeId}/${item.path}` : `/trees/${treeId}`}
              className="rounded-md px-3 py-1.5 text-sm text-archive-700 hover:bg-archive-100"
            >
              {item.label}
            </Link>
          ))}
          {role === "admin" && (
            <Link
              href={`/trees/${treeId}/settings`}
              className="rounded-md px-3 py-1.5 text-sm text-archive-700 hover:bg-archive-100"
            >
              Settings
            </Link>
          )}
        </nav>
        <span className="ml-auto rounded bg-archive-100 px-2 py-0.5 text-xs text-archive-700">
          {user ? `your role: ${role}` : "public archive — read-only"}
        </span>
      </div>
      {children}
    </div>
  );
}
