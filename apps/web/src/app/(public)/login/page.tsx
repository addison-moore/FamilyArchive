import { getSessionUser } from "@familyarchive/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";

import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { error, callbackUrl } = await searchParams;

  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <FormError message={error ? "Invalid email or password." : undefined} />
      <form action={loginAction} className="mt-4 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </Field>
        <button type="submit" className={`${buttonClass} w-full`}>
          Sign in
        </button>
      </form>
      <p className="mt-4 text-sm text-archive-700/80">
        New instance?{" "}
        <Link href="/register" className="text-accent-600 hover:underline">
          Create the first account
        </Link>
        . Otherwise, ask a family member for an invite link.
      </p>
    </Card>
  );
}
