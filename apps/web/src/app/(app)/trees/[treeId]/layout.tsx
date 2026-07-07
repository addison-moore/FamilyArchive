import { getSessionUser, getTreeRole } from "@familyarchive/auth";
import { getDb, trees } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getAccessibleTrees } from "@/lib/trees";

/** Tree-level navigation (PRD §7.3). Feature pages activate as milestones land. */
const PLACEHOLDER_NAV = [
  { label: "Tree", milestone: 4 },
  { label: "People", milestone: 3 },
  { label: "Media", milestone: 6 },
  { label: "Collections", milestone: 10 },
  { label: "Search", milestone: 10 },
  { label: "Suggestions", milestone: 11 },
] as const;

export default async function TreeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = await getTreeRole(user, treeId);
  if (!role) notFound();

  const [treeRows, accessibleTrees] = await Promise.all([
    getDb().select().from(trees).where(eq(trees.id, treeId)).limit(1),
    getAccessibleTrees(user),
  ]);
  const tree = treeRows[0];
  if (!tree) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-archive-100 pb-4">
        <details className="relative">
          <summary className="cursor-pointer list-none text-xl font-semibold hover:text-accent-600">
            {tree.name} <span className="text-sm text-archive-700/50">▾</span>
          </summary>
          <div className="absolute z-10 mt-1 w-64 rounded-md border border-archive-100 bg-white p-1 shadow-md">
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
            <Link
              href="/trees"
              className="block rounded border-t border-archive-100 px-3 py-2 text-sm text-archive-700/80 hover:bg-archive-50"
            >
              All trees…
            </Link>
          </div>
        </details>
        <nav aria-label="Tree navigation" className="flex flex-wrap items-center gap-1">
          {PLACEHOLDER_NAV.map((item) => (
            <span
              key={item.label}
              aria-disabled="true"
              title={`Coming in Milestone ${item.milestone}`}
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-archive-700/50"
            >
              {item.label}
            </span>
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
          your role: {role}
        </span>
      </div>
      {children}
    </div>
  );
}
