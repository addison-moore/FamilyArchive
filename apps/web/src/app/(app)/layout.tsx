import { getSessionUser, signOut } from "@familyarchive/auth";
import { getDb, users } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";

/**
 * Authenticated app shell. Anonymous visitors are allowed through so public
 * archives (PRD §23) can render — every page/action enforces its own access;
 * non-public pages redirect to /login themselves.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-archive-100 bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight no-underline">
            Family<span className="text-accent-600">Archive</span>
          </Link>
          {user ? (
            <details className="group relative ml-auto">
              <summary className="cursor-pointer list-none rounded-md border border-archive-100 px-3 py-1.5 text-sm text-archive-700 hover:bg-archive-50">
                {user.name ?? user.email}
                {user.role === "owner" && (
                  <span className="ml-2 rounded bg-archive-100 px-1.5 py-0.5 text-xs">owner</span>
                )}
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-archive-100 bg-surface p-1 shadow-md">
                <div className="px-3 py-2 text-xs text-archive-700/70">{user.email}</div>
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
            </details>
          ) : (
            <Link
              href="/login"
              className="ml-auto rounded-md border border-archive-100 px-3 py-1.5 text-sm text-archive-700 no-underline hover:bg-archive-50"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-archive-100 py-4 text-center text-xs text-archive-700/60">
        FamilyArchive — free, open-source, self-hosted family history
      </footer>
    </div>
  );
}
