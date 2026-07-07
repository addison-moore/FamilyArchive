import { getSessionUser, getTreeRole } from "@familyarchive/auth";
import { getDb, trees } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import Link from "next/link";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { getValidInvite } from "@/lib/invites";

import { acceptInviteAction, registerViaInviteAction } from "./actions";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const invite = await getValidInvite(token);
  if (!invite) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Invite not valid</h1>
        <p className="text-sm leading-relaxed text-archive-700">
          This invite link is invalid, expired, or has been revoked. Ask the person who invited you
          to send a new one.
        </p>
      </Card>
    );
  }

  const treeRows = await getDb()
    .select({ name: trees.name })
    .from(trees)
    .where(eq(trees.id, invite.treeId))
    .limit(1);
  const treeName = treeRows[0]?.name ?? "a family tree";

  const user = await getSessionUser();

  if (user) {
    const existingRole = await getTreeRole(user, invite.treeId);
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Join “{treeName}”</h1>
        {existingRole ? (
          <>
            <p className="text-sm text-archive-700">
              You already have {existingRole} access to this tree.
            </p>
            <Link
              href={`/trees/${invite.treeId}`}
              className={`${buttonClass} mt-4 inline-block no-underline`}
            >
              Open the tree
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-archive-700">
              You&apos;ve been invited to join as <strong>{invite.role}</strong>, signed in as{" "}
              {user.email}.
            </p>
            <form action={acceptInviteAction} className="mt-4">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={buttonClass}>
                Join tree
              </button>
            </form>
          </>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Join “{treeName}”</h1>
      <p className="mb-4 text-sm text-archive-700/80">
        You&apos;ve been invited as <strong>{invite.role}</strong>. Create your account to join.
      </p>
      <FormError message={error} />
      <form action={registerViaInviteAction} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Name">
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={invite.email ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Password (min. 8 characters)">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <button type="submit" className={`${buttonClass} w-full`}>
          Create account and join
        </button>
      </form>
      <p className="mt-4 text-sm text-archive-700/80">
        Already have an account?{" "}
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
          className="text-accent-600 hover:underline"
        >
          Sign in first
        </Link>
        , then open this link again.
      </p>
    </Card>
  );
}
