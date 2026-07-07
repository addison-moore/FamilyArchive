import { getDb, treeMemberships, trees } from "@familyarchive/db";
import { count, eq } from "drizzle-orm";

import { Card } from "@/components/form";

export default async function TreeHomePage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const db = getDb();
  const [treeRows, memberRows] = await Promise.all([
    db.select().from(trees).where(eq(trees.id, treeId)).limit(1),
    db.select({ value: count() }).from(treeMemberships).where(eq(treeMemberships.treeId, treeId)),
  ]);
  const tree = treeRows[0];
  if (!tree) return null; // layout already 404s

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <h1 className="text-xl font-semibold">{tree.name}</h1>
        {tree.description && (
          <p className="mt-2 text-sm leading-relaxed text-archive-700">{tree.description}</p>
        )}
        <p className="mt-4 text-sm text-archive-700/70">
          {memberRows[0]?.value ?? 0} member(s) · created{" "}
          {tree.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
        </p>
        <p className="mt-6 rounded-md bg-archive-100/60 px-4 py-3 text-sm text-archive-700">
          The interactive family tree arrives in Milestone 4 — people and relationships in Milestone
          3. For now, admins can invite family members from Settings.
        </p>
      </Card>
    </div>
  );
}
