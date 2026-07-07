import { getSessionUser } from "@familyarchive/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { anyUserExists } from "@/lib/users";

import { registerOwnerAction } from "./actions";

/**
 * Owner bootstrap only (PRD §30.4): the first registered account becomes the
 * instance Owner. Once any user exists, registration happens exclusively through
 * invite links (M2 decision).
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");

  if (await anyUserExists()) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Registration is invite-only</h1>
        <p className="text-sm leading-relaxed text-archive-700">
          This FamilyArchive instance already has an owner. Ask a family member with admin access to
          send you an invite link.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-accent-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    );
  }

  const { error } = await searchParams;
  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Set up your instance</h1>
      <p className="mb-4 text-sm text-archive-700/80">
        You&apos;re the first person here — this account becomes the instance owner.
      </p>
      <FormError message={error} />
      <form action={registerOwnerAction} className="mt-4 space-y-4">
        <Field label="Name">
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
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
          Create owner account
        </button>
      </form>
    </Card>
  );
}
