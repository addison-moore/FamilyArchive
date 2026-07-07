import { canCreateTrees, requireUser } from "@familyarchive/auth";
import Link from "next/link";

import { buttonClass, Card, subtleButtonClass } from "@/components/form";
import { getAccessibleTrees } from "@/lib/trees";

import { setDefaultTreeAction } from "./actions";

export default async function TreesPage() {
  const user = await requireUser();
  const [treesList, showCreate] = await Promise.all([
    getAccessibleTrees(user),
    canCreateTrees(user),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Family archives</h1>
        {showCreate && (
          <div className="flex gap-2">
            <Link href="/trees/import" className={`${subtleButtonClass} no-underline`}>
              Import GEDCOM
            </Link>
            <Link href="/trees/new" className={`${buttonClass} no-underline`}>
              New archive
            </Link>
          </div>
        )}
      </div>

      {treesList.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            {showCreate
              ? "No archives yet. Create the first one to get started."
              : "You don't have access to any archives yet. Ask a family member for an invite link."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {treesList.map((tree) => (
            <li key={tree.id}>
              <div className="flex items-center gap-4 rounded-xl border border-archive-100 bg-white p-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/trees/${tree.id}`}
                    className="font-medium text-archive-900 hover:text-accent-600"
                  >
                    {tree.name}
                  </Link>
                  {tree.description && (
                    <p className="truncate text-sm text-archive-700/80">{tree.description}</p>
                  )}
                </div>
                <span className="rounded bg-archive-100 px-2 py-0.5 text-xs text-archive-700">
                  {tree.role}
                </span>
                {user.defaultTreeId === tree.id ? (
                  <span className="text-xs text-archive-700/60">default</span>
                ) : (
                  <form action={setDefaultTreeAction}>
                    <input type="hidden" name="treeId" value={tree.id} />
                    <button type="submit" className={subtleButtonClass}>
                      Make default
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
