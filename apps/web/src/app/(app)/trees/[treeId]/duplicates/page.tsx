import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, subtleButtonClass } from "@/components/form";
import { PersonAvatar, personLifespan } from "@/components/person-summary";
import { PageHeader } from "@/components/ui";
import { findDuplicatePairs } from "@/lib/duplicates";

/** Possible-duplicates review with merge entry points. */
export default async function DuplicatesPage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  try {
    await requireTreeRole(treeId, "editor");
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  const pairs = await findDuplicatePairs(treeId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Possible duplicates"
        description="People with the same name and compatible birth years — usually the result of overlapping GEDCOM imports. Compare each pair and merge them into one shared record."
      />
      {pairs.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">No possible duplicates found.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pairs.map((pair) => (
            <li key={`${pair.a.id}-${pair.b.id}`}>
              <Card>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid min-w-0 flex-1 basis-full gap-4 sm:basis-0 sm:grid-cols-2">
                    {[pair.a, pair.b].map((person) => (
                      <div key={person.id} className="flex min-w-0 items-center gap-3">
                        <PersonAvatar name={person.fullName} />
                        <div className="min-w-0">
                          <Link
                            href={`/trees/${treeId}/people/${person.id}`}
                            className="font-medium hover:text-accent-600"
                          >
                            {person.fullName}
                          </Link>
                          <div className="text-xs text-archive-700">
                            {personLifespan(person) ?? "no dates"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/trees/${treeId}/people/${pair.a.id}/merge/${pair.b.id}`}
                    className={`${subtleButtonClass} no-underline`}
                  >
                    Compare &amp; merge
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
