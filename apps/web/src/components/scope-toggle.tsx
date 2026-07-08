import Link from "next/link";

import type { ViewScope } from "@/lib/branch";

/**
 * "My branch / Everyone" toggle (PRD §10.6). URL-param based; the stored
 * preference supplies the default. A convenience filter, never a permission.
 */
export function ScopeToggle({
  basePath,
  scope,
  params,
  anchorName,
}: {
  basePath: string;
  scope: ViewScope;
  params: Record<string, string | undefined>;
  anchorName: string | null;
}) {
  const href = (target: ViewScope) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    query.set("scope", target);
    return `${basePath}?${query.toString()}`;
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-md border border-archive-100 bg-surface p-0.5 text-sm">
        <Link
          href={href("branch")}
          title={
            anchorName
              ? `Blood relatives and partners of ${anchorName}`
              : "Set a starting person to use branch view"
          }
          className={`rounded px-3 py-1.5 no-underline ${
            scope === "branch"
              ? "bg-archive-100 font-medium"
              : "text-archive-700 hover:bg-archive-50"
          }`}
        >
          My branch
        </Link>
        <Link
          href={href("all")}
          className={`rounded px-3 py-1.5 no-underline ${
            scope === "all" ? "bg-archive-100 font-medium" : "text-archive-700 hover:bg-archive-50"
          }`}
        >
          Everyone
        </Link>
      </div>
    </div>
  );
}
