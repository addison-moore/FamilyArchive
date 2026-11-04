import { getSessionUser, getTreeRole } from "@familyarchive/auth";
import { getDb, trees } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { HeaderNav, RowNav } from "@/components/archive-nav";
import { Dropdown } from "@/components/dropdown";
import { menuItemClass, menuPanelClass, menuTriggerClass } from "@/components/form";
import { Badge, Chevron } from "@/components/ui";
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

  const root = `/trees/${treeId}`;
  const navItems = [
    ...ACTIVE_NAV.map((item) => ({
      label: item.label,
      href: item.path ? `${root}/${item.path}` : root,
    })),
    ...(role === "admin" ? [{ label: "Settings", href: `${root}/settings` }] : []),
  ];

  // The wordmark puts the switcher too far along a phone's header for its panel
  // to fit under it, so below sm the panel anchors to the sticky header instead.
  const archiveSwitcher = (
    <Dropdown
      className="min-w-0 shrink sm:relative"
      summaryClassName={`${menuTriggerClass} font-medium`}
      summary={
        <>
          <span className="max-w-[9rem] truncate xl:max-w-[12rem]">{tree.name}</span>
          <Chevron />
        </>
      }
    >
      <div className={`absolute left-4 mt-1 w-64 sm:left-0 ${menuPanelClass}`}>
        {accessibleTrees.map((item) => (
          <Link
            key={item.id}
            href={`/trees/${item.id}`}
            aria-current={item.id === treeId ? "true" : undefined}
            className={`${menuItemClass} ${item.id === treeId ? "font-semibold" : ""}`}
          >
            {item.name}
          </Link>
        ))}
        {user && (
          <Link
            href="/trees"
            className={`${menuItemClass} rounded-t-none border-t border-archive-100 text-archive-700`}
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
            <HeaderNav root={root} items={navItems} />
          </div>
        }
        trailing={
          // The header has no room for it at lg, where the nav joins the bar.
          <Badge className="hidden md:inline-block lg:hidden xl:inline-block">
            {user ? `your role: ${role}` : "public archive — read-only"}
          </Badge>
        }
      />
      {/* Narrow screens lose the in-header nav, so it reappears as its own row
          rather than being unreachable. */}
      <RowNav root={root} items={navItems} />
      {/* The height chain the canvas page relies on: min-h-0 lets a flex child
          shrink below its content so `flex-1` resolves against the viewport
          instead of the graph's own size. `*:w-full` is for the other pages,
          which centre themselves with mx-auto and a max-w-*: auto margins stop
          a flex child stretching, so without it they shrink to their content. */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-6 *:w-full">{children}</div>
    </>
  );
}
