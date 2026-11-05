"use server";

import {
  clientIp,
  consumeRateLimit,
  describeRetryAfter,
  isAuthError,
  REGISTER_PER_IP,
  requireUser,
  signIn,
} from "@familyarchive/auth";
import { getDb, treeMemberships } from "@familyarchive/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { getValidInvite, type InviteRow } from "@/lib/invites";
import { createUser, registrationSchema } from "@/lib/users";

/** Grant the invite's role. An existing member keeps the role they already hold. */
async function joinArchive(invite: InviteRow, userId: string): Promise<void> {
  const joined = await getDb()
    .insert(treeMemberships)
    .values({ treeId: invite.treeId, userId, role: invite.role })
    .onConflictDoNothing()
    .returning({ id: treeMemberships.id });
  if (joined[0]) {
    await recordAudit({
      treeId: invite.treeId,
      actorId: userId,
      action: "membership.joined",
      targetType: "membership",
      targetId: joined[0].id,
      summary: `Joined as ${invite.role} through an invite link`,
      metadata: { inviteId: invite.id },
    });
  }
}

/** Logged-in user accepts an invite. */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const user = await requireUser();
  const invite = await getValidInvite(token);
  if (!invite) redirect(`/invite/${encodeURIComponent(token)}`);

  await joinArchive(invite, user.id);
  redirect(`/trees/${invite.treeId}`);
}

/** New user registers through an invite link (the only open registration path). */
export async function registerViaInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const invitePath = `/invite/${encodeURIComponent(token)}`;

  // Bounded per source address: an invite link is a bearer token, so anyone
  // holding one can create accounts until it expires.
  const ip = clientIp(await headers());
  if (ip !== "unknown") {
    const limit = await consumeRateLimit(`register:ip:${ip}`, REGISTER_PER_IP);
    if (!limit.allowed) {
      const message = `Too many attempts. Try again ${describeRetryAfter(limit.retryAfterSeconds)}.`;
      redirect(`${invitePath}?error=${encodeURIComponent(message)}`);
    }
  }

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

  await joinArchive(invite, userId);

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
