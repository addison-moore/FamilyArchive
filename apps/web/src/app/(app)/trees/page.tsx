import { AppHeader, PageBody } from "@/components/app-header";
import { canCreateTrees, getSessionUser } from "@familyarchive/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Card, subtleButtonClass } from "@/components/form";
import { Badge, PageHeader } from "@/components/ui";
import { getAccessibleTrees } from "@/lib/trees";

import { setDefaultTreeAction } from "./actions";

export default async function TreesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [treesList, showCreate] = await Promise.all([
    getAccessibleTrees(user),
    canCreateTrees(user),
  ]);

  return (
    <>
      <AppHeader />
      <PageBody>
        <div className="mx-auto max-w-3xl">
          <PageHeader
            title="Family archives"
            actions={
              showCreate && (
                <>
                  <Link
                    href="/trees/import"
                    className={`${subtleButtonClass} whitespace-nowrap no-underline`}
                  >
                    Import GEDCOM
                  </Link>
                  <Link
                    href="/trees/new"
                    className={`${buttonClass} whitespace-nowrap no-underline`}
                  >
                    New archive
                  </Link>
                </>
              )
            }
          />

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
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-archive-100 bg-surface p-4 shadow-sm">
                    <div className="min-w-48 flex-1">
                      <Link
                        href={`/trees/${tree.id}`}
                        className="font-medium text-archive-900 hover:text-accent-600"
                      >
                        {tree.name}
                      </Link>
                      {tree.description && (
                        <p className="truncate text-sm text-archive-700">{tree.description}</p>
                      )}
                    </div>
                    <Badge className="capitalize">{tree.role}</Badge>
                    {user.defaultTreeId === tree.id ? (
                      <span className="text-xs text-archive-700">default</span>
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
      </PageBody>
    </>
  );
}
