import type { ReactNode } from "react";

/**
 * Tree-level navigation per PRD §7.3. Entries activate as their milestones land;
 * until then they render as disabled placeholders.
 */
const NAV_ITEMS = [
  { label: "Tree", milestone: 4 },
  { label: "People", milestone: 3 },
  { label: "Media", milestone: 6 },
  { label: "Collections", milestone: 10 },
  { label: "Search", milestone: 10 },
  { label: "Suggestions", milestone: 11 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-archive-100 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">
          <span className="text-lg font-semibold tracking-tight">
            Family<span className="text-accent-600">Archive</span>
          </span>
          <nav aria-label="Tree navigation" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <span
                key={item.label}
                aria-disabled="true"
                title={`Coming in Milestone ${item.milestone}`}
                className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-archive-700/50"
              >
                {item.label}
              </span>
            ))}
          </nav>
          <div className="ml-auto">
            <button
              type="button"
              disabled
              title="Sign-in arrives in Milestone 2"
              className="cursor-not-allowed rounded-md border border-archive-100 px-3 py-1.5 text-sm text-archive-700/50"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-archive-100 py-4 text-center text-xs text-archive-700/60">
        FamilyArchive — free, open-source, self-hosted family history (AGPL-3.0-or-later)
      </footer>
    </div>
  );
}
