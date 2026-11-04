import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { auditLogs, getDb, users } from "@familyarchive/db";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Card } from "@/components/form";
import { PageHeader } from "@/components/ui";

/** Admin-only audit view. Retention is instance-configured. */
export default async function AuditPage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  try {
    await requireMemberRole(treeId, "admin");
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  const entries = await getDb()
    .select({
      log: auditLogs,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(eq(auditLogs.treeId, treeId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(500);

  const retention = getEnv().AUDIT_RETENTION_DAYS;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Audit log"
        description={
          <>
            Retention: {retention > 0 ? `${retention} day(s)` : "forever (default)"} — configured
            via <code>AUDIT_RETENTION_DAYS</code>. Showing the latest {entries.length} entries.
          </>
        }
      />

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">No audit entries yet.</p>
        </Card>
      ) : (
        // On a phone each row stacks into its own short block rather than the
        // whole table scrolling sideways. A screen reader loses the row and cell
        // semantics at that width, but keeps the same reading order.
        <div className="rounded-xl border border-archive-100 bg-surface shadow-sm">
          <table className="block w-full text-sm sm:table">
            <thead className="hidden sm:table-header-group">
              <tr className="border-b border-archive-100 text-left text-xs text-archive-700">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Who</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-archive-100 sm:table-row-group">
              {entries.map((entry) => (
                <tr key={entry.log.id} className="block space-y-1 px-4 py-3 sm:table-row sm:p-0">
                  <td className="block text-archive-700 sm:table-cell sm:px-4 sm:py-2.5 sm:whitespace-nowrap">
                    {entry.log.createdAt.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="block sm:table-cell sm:px-4 sm:py-2.5 sm:whitespace-nowrap">
                    {entry.actorName ?? entry.actorEmail ?? "system"}
                  </td>
                  <td className="block sm:table-cell sm:px-4 sm:py-2.5 sm:whitespace-nowrap">
                    <code className="rounded bg-archive-100 px-1.5 py-0.5 text-xs">
                      {entry.log.action}
                    </code>
                  </td>
                  <td className="block sm:table-cell sm:px-4 sm:py-2.5">{entry.log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
