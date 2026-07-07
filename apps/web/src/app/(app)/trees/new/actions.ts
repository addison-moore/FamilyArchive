"use server";

import { AuthorizationError, canCreateTrees, requireUser } from "@familyarchive/auth";
import { getDb, treeMemberships, trees } from "@familyarchive/db";
import { redirect } from "next/navigation";
import { z } from "zod";

const createTreeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function createTreeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!(await canCreateTrees(user))) {
    throw new AuthorizationError("Tree creation requires owner or admin access");
  }

  const parsed = createTreeSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/trees/new?error=${encodeURIComponent(message)}`);
  }

  const db = getDb();
  const treeId = await db.transaction(async (tx) => {
    const [tree] = await tx
      .insert(trees)
      .values({
        name: parsed.data.name,
        description: parsed.data.description,
        createdBy: user.id,
      })
      .returning({ id: trees.id });
    if (!tree) throw new Error("Failed to create tree");
    // Creator becomes Admin of the new tree (M2 decision).
    await tx.insert(treeMemberships).values({ treeId: tree.id, userId: user.id, role: "admin" });
    return tree.id;
  });

  redirect(`/trees/${treeId}`);
}
