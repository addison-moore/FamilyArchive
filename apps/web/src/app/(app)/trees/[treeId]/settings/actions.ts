"use server";

import { requireOwner, requireTreeRole } from "@familyarchive/auth";
import { getDb, invites, treeMemberships, trees } from "@familyarchive/db";
import { isTreeRole } from "@familyarchive/shared";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enqueueEmail, smtpConfigured } from "@/lib/email";
import { DEFAULT_INVITE_EXPIRY_DAYS, generateInviteToken } from "@/lib/invites";
import { getEnv } from "@familyarchive/config";

function settingsPath(treeId: string): string {
  return `/trees/${treeId}/settings`;
}

const updateTreeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function updateTreeAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  await requireTreeRole(treeId, "admin");

  const parsed = updateTreeSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${settingsPath(treeId)}?error=${encodeURIComponent(message)}`);
  }

  await getDb()
    .update(trees)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(trees.id, treeId));
  revalidatePath(settingsPath(treeId));
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const role = String(formData.get("role") ?? "");
  await requireTreeRole(treeId, "admin");
  if (!isTreeRole(role)) return;

  // treeId in the filter keeps the mutation tree-scoped (PRD §31.2).
  await getDb()
    .update(treeMemberships)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(treeMemberships.id, membershipId), eq(treeMemberships.treeId, treeId)));
  revalidatePath(settingsPath(treeId));
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  await requireTreeRole(treeId, "admin");

  await getDb()
    .delete(treeMemberships)
    .where(and(eq(treeMemberships.id, membershipId), eq(treeMemberships.treeId, treeId)));
  revalidatePath(settingsPath(treeId));
}

const createInviteSchema = z.object({
  role: z.string().refine(isTreeRole, "Invalid role"),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(DEFAULT_INVITE_EXPIRY_DAYS),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
});

export async function createInviteAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const { user } = await requireTreeRole(treeId, "admin");

  const parsed = createInviteSchema.safeParse({
    role: formData.get("role"),
    expiresInDays: formData.get("expiresInDays") || undefined,
    email: formData.get("email"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${settingsPath(treeId)}?error=${encodeURIComponent(message)}`);
  }

  const token = generateInviteToken();
  const email = parsed.data.email || null;
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

  await getDb().insert(invites).values({
    treeId,
    role: parsed.data.role,
    token,
    email,
    createdBy: user.id,
    expiresAt,
  });

  let emailStatus = "";
  if (email) {
    if (smtpConfigured()) {
      const treeRows = await getDb()
        .select({ name: trees.name })
        .from(trees)
        .where(eq(trees.id, treeId))
        .limit(1);
      const treeName = treeRows[0]?.name ?? "a family tree";
      const inviteUrl = `${getEnv().APP_URL}/invite/${token}`;
      const inviter = user.name ?? user.email;
      await enqueueEmail({
        to: email,
        subject: `You're invited to join "${treeName}" on FamilyArchive`,
        text:
          `${inviter} has invited you to join the family tree "${treeName}" on FamilyArchive ` +
          `as ${parsed.data.role}.\n\n` +
          `Open this link to join:\n${inviteUrl}\n\n` +
          `The invite expires on ${expiresAt.toDateString()}.`,
      });
      emailStatus = "&emailed=1";
    } else {
      emailStatus = "&smtp=0";
    }
  }

  redirect(`${settingsPath(treeId)}?invite=${encodeURIComponent(token)}${emailStatus}#invites`);
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");
  await requireTreeRole(treeId, "admin");

  await getDb()
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.treeId, treeId)));
  revalidatePath(settingsPath(treeId));
}

export async function deleteTreeAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "");
  await requireOwner();

  const treeRows = await getDb().select().from(trees).where(eq(trees.id, treeId)).limit(1);
  const tree = treeRows[0];
  if (!tree) redirect("/trees");
  if (confirmName !== tree.name) {
    redirect(
      `${settingsPath(treeId)}?error=${encodeURIComponent("Type the exact tree name to confirm deletion")}#danger`,
    );
  }

  await getDb().delete(trees).where(eq(trees.id, treeId));
  redirect("/trees");
}
