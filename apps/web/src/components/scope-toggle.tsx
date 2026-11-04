import { SegmentedLinks } from "@/components/ui";
import type { ViewScope } from "@/lib/branch";

/**
 * "My branch / Everyone" toggle. URL-param based; the stored
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
    <SegmentedLinks
      label="Whose records to show"
      items={[
        {
          href: href("branch"),
          label: "My branch",
          active: scope === "branch",
          title: anchorName
            ? `Blood relatives and partners of ${anchorName}`
            : "Set a starting person to use branch view",
        },
        { href: href("all"), label: "Everyone", active: scope === "all" },
      ]}
    />
  );
}
