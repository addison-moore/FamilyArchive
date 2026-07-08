import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { auditLogs, getDb, users } from "@familyarchive/db";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Card } from "@/components/form";

/** Admin-only audit view (PRD §22). Retention is instance-configured (§22.3). */
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
      <h1 className="mb-1 text-2xl font-semibold">Audit log</h1>
      <p className="mb-6 text-sm text-archive-700/80">
        Retention: {retention > 0 ? `${retention} day(s)` : "forever (default)"} — configured via{" "}
        <code>AUDIT_RETENTION_DAYS</code>. Showing the latest {entries.length} entries.
      </p>

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">No audit entries yet.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-archive-100 bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-archive-100 text-left text-xs text-archive-700/70">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Who</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-archive-100">
              {entries.map((entry) => (
                <tr key={entry.log.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-archive-700/80">
                    {entry.log.createdAt.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {entry.actorName ?? entry.actorEmail ?? "system"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <code className="rounded bg-archive-100 px-1.5 py-0.5 text-xs">
                      {entry.log.action}
                    </code>
                  </td>
                  <td className="px-4 py-2.5">{entry.log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
