"use server";

import { getTreeRole, requireUser } from "@familyarchive/auth";
import { getDb, users } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function setDefaultTreeAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const user = await requireUser();
  if (!(await getTreeRole(user, treeId))) redirect("/trees");

  await getDb().update(users).set({ defaultTreeId: treeId }).where(eq(users.id, user.id));
  revalidatePath("/trees");
}
