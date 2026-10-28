import type { ReactNode } from "react";

/**
 * Authenticated app shell. Anonymous visitors are allowed through so public
 * archives can render — every page/action enforces its own access;
 * non-public pages redirect to /login themselves.
 *
 * Deliberately header-less: each section renders its own <AppHeader />, because
 * the archive section puts its navigation inside that bar and a nested layout
 * cannot reach into a parent's header. `main` is unconstrained so a workspace
 * page (the tree canvas) can use the whole viewport; document-shaped pages wrap
 * themselves in <PageBody /> or set their own max width.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex min-h-0 w-full flex-1 flex-col">{children}</main>
      <footer className="shrink-0 border-t border-archive-100 py-4 text-center text-xs text-archive-700/60">
        FamilyArchive — free, open-source, self-hosted family history
      </footer>
    </div>
  );
}
