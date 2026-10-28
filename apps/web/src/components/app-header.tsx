import { getSessionUser, signOut } from "@familyarchive/auth";
import { getDb, users } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import type { ReactNode } from "react";

import { Dropdown } from "@/components/dropdown";

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
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight no-underline">
          Family<span className="text-accent-600">Archive</span>
        </Link>
        {nav}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {trailing}
          {user ? (
            <Dropdown
              className="group relative min-w-0"
              summaryClassName="flex cursor-pointer list-none items-center gap-2 rounded-md border border-archive-100 px-3 py-1.5 text-sm text-archive-700 hover:bg-archive-50"
              summary={
                <>
                  <span className="max-w-[14rem] truncate">{user.name ?? user.email}</span>
                  {user.role === "owner" && (
                    <span className="shrink-0 rounded bg-archive-100 px-1.5 py-0.5 text-xs">
                      owner
                    </span>
                  )}
                </>
              }
            >
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-archive-100 bg-surface p-1 shadow-md">
                <div className="truncate px-3 py-2 text-xs text-archive-700/70" title={user.email}>
                  {user.email}
                </div>
                <Link
                  href="/trees"
                  className="block rounded px-3 py-2 text-sm no-underline hover:bg-archive-50"
                >
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
                  <button
                    type="submit"
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-archive-50"
                  >
                    {user.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-archive-50"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </Dropdown>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-archive-100 px-3 py-1.5 text-sm text-archive-700 no-underline hover:bg-archive-50"
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
  return <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>;
}
