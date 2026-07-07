import { getSessionUser, signOut } from "@familyarchive/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-archive-100 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight no-underline">
            Family<span className="text-accent-600">Archive</span>
          </Link>
          <Link href="/trees" className="text-sm text-archive-700 hover:text-archive-900">
            My archives
          </Link>
          <details className="group relative ml-auto">
            <summary className="cursor-pointer list-none rounded-md border border-archive-100 px-3 py-1.5 text-sm text-archive-700 hover:bg-archive-50">
              {user.name ?? user.email}
              {user.role === "owner" && (
                <span className="ml-2 rounded bg-archive-100 px-1.5 py-0.5 text-xs">owner</span>
              )}
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-archive-100 bg-white p-1 shadow-md">
              <div className="px-3 py-2 text-xs text-archive-700/70">{user.email}</div>
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-archive-100 py-4 text-center text-xs text-archive-700/60">
        FamilyArchive — free, open-source, self-hosted family history (AGPL-3.0-or-later)
      </footer>
    </div>
  );
}
