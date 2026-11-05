"use server";

import { requireOwner } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { createPasswordResetToken } from "@/lib/password-reset";
import { getResetLinkTarget, removeUser, type ResetLinkState } from "@/lib/user-admin";

/**
 * Returned to the page rather than carried in a redirect as invite links are: browser
 * history and proxy logs keep URLs, and this token is a way into someone's account.
 */
export async function createResetLinkAction(
  _previous: ResetLinkState,
  formData: FormData,
): Promise<ResetLinkState> {
  const owner = await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const target = await getResetLinkTarget(userId);
  if (!target) return { error: "That account no longer exists." };
  // A borrowed Owner session could otherwise take this account for good, skipping the
  // current password that Account settings asks for.
  if (target.role === "owner") return { error: "Change your own password in Account settings." };

  const token = await createPasswordResetToken(target.email);
  if (!token) return { error: "That account no longer exists." };

  await Promise.all(
    target.treeIds.map((treeId) =>
      recordAudit({
        treeId,
        actorId: owner.id,
        action: "account.reset_link_created",
        targetType: "user",
        targetId: userId,
        summary: `Created a password reset link for ${target.name ?? target.email}`,
      }),
    ),
  );
  return { url: `${getEnv().APP_URL}/reset-password?token=${token}` };
}

export async function removeUserAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const confirmEmail = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();

  const result = await removeUser(userId, confirmEmail);
  if (result.status !== "removed") redirect(`/admin/users?error=${result.status}`);

  await Promise.all(
    [...result.archives].map(([treeId, revokedInvites]) =>
      recordAudit({
        treeId,
        actorId: owner.id,
        action: "account.removed",
        targetType: "user",
        targetId: userId,
        summary:
          `Removed the account of ${result.label} (${result.email})` +
          (revokedInvites > 0
            ? ` and revoked ${revokedInvites} invite link${revokedInvites === 1 ? "" : "s"}`
            : ""),
      }),
    ),
  );
  revalidatePath("/admin/users");
  redirect("/admin/users?removed=1");
}
