import { getSessionUser, signOut } from "@familyarchive/auth";
import { getDb, users } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import type { ReactNode } from "react";

import { Dropdown } from "@/components/dropdown";
import {
  menuItemClass,
  menuPanelClass,
  menuTriggerClass,
  subtleButtonClass,
} from "@/components/form";
import { Badge, Chevron } from "@/components/ui";

/**
 * The single top bar for the authenticated app.
 *
 * Rendered by each section rather than by the (app) layout, because the archive
 * section needs its own navigation *inside* this bar — a nested layout cannot
 * reach into a parent's header, and stacking a second row below it was costing
 * the tree canvas vertical space it needs more than the chrome does.
 *
 * `nav` sits beside the wordmark; `trailing` sits just before the account menu.
 */
export async function AppHeader({ nav, trailing }: { nav?: ReactNode; trailing?: ReactNode }) {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-30 border-b border-archive-100 bg-surface">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight no-underline">
          Family<span className="text-accent-600">Archive</span>
        </Link>
        {nav}
        {/* An account name can truncate, but "Sign in" has to fit whole. */}
        <div className={`ml-auto flex items-center gap-3 ${user ? "min-w-0" : "shrink-0"}`}>
          {trailing}
          {user ? (
            <Dropdown
              className="group relative min-w-0"
              summaryClassName={`${menuTriggerClass} text-archive-700`}
              summary={
                <>
                  <span className="max-w-[9rem] truncate xl:max-w-[14rem]">
                    {user.name ?? user.email}
                  </span>
                  {/* Like the role badge, it gives way at lg where the nav joins the bar. */}
                  {user.role === "owner" && (
                    <Badge className="hidden sm:inline-block lg:hidden xl:inline-block">
                      owner
                    </Badge>
                  )}
                  <Chevron />
                </>
              }
            >
              <div className={`absolute right-0 mt-1 w-48 ${menuPanelClass}`}>
                <div className="truncate px-3 py-2 text-xs text-archive-700" title={user.email}>
                  {user.email}
                </div>
                <Link href="/trees" className={menuItemClass}>
                  My archives
                </Link>
                <form
                  action={async () => {
                    "use server";
                    const current = await getSessionUser();
                    if (!current) return;
                    await getDb()
                      .update(users)
                      .set({
                        theme: current.theme === "dark" ? "light" : "dark",
                        updatedAt: new Date(),
                      })
                      .where(eq(users.id, current.id));
                    revalidatePath("/", "layout");
                  }}
                >
                  <button type="submit" className={menuItemClass}>
                    {user.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button type="submit" className={menuItemClass}>
                    Sign out
                  </button>
                </form>
              </div>
            </Dropdown>
          ) : (
            <Link
              href="/login"
              className={`${subtleButtonClass} shrink-0 whitespace-nowrap no-underline`}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Centred column for the pages that are documents rather than workspaces. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>;
}
