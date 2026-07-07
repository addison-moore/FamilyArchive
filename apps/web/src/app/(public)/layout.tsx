import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="py-8 text-center">
        <span className="text-2xl font-semibold tracking-tight">
          Family<span className="text-accent-600">Archive</span>
        </span>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4">{children}</main>
      <footer className="py-6 text-center text-xs text-archive-700/60">
        Free, open-source, self-hosted family history (AGPL-3.0-or-later)
      </footer>
    </div>
  );
}
