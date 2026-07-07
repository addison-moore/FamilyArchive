"use server";

import { isAuthError, requireUser, signIn } from "@familyarchive/auth";
import { getDb, treeMemberships } from "@familyarchive/db";
import { redirect } from "next/navigation";

import { getValidInvite } from "@/lib/invites";
import { createUser, registrationSchema } from "@/lib/users";

/** Logged-in user accepts an invite. */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const user = await requireUser();
  const invite = await getValidInvite(token);
  if (!invite) redirect(`/invite/${encodeURIComponent(token)}`);

  await getDb()
    .insert(treeMemberships)
    .values({ treeId: invite.treeId, userId: user.id, role: invite.role })
    .onConflictDoNothing();
  redirect(`/trees/${invite.treeId}`);
}

/** New user registers through an invite link (the only open registration path). */
export async function registerViaInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const invitePath = `/invite/${encodeURIComponent(token)}`;

  const invite = await getValidInvite(token);
  if (!invite) redirect(invitePath);

  const parsed = registrationSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${invitePath}?error=${encodeURIComponent(message)}`);
  }

  const userId = await createUser({ ...parsed.data, role: "user" });
  if (!userId) {
    const message = "Email already registered — sign in instead, then open this link again.";
    redirect(`${invitePath}?error=${encodeURIComponent(message)}`);
  }

  await getDb()
    .insert(treeMemberships)
    .values({ treeId: invite.treeId, userId, role: invite.role })
    .onConflictDoNothing();

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: `/trees/${invite.treeId}`,
    });
  } catch (error) {
    if (isAuthError(error)) redirect("/login");
    throw error;
  }
}
