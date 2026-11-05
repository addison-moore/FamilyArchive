import { getSessionUser, MIN_PASSWORD_LENGTH } from "@familyarchive/auth";
import { smtpConfigured } from "@familyarchive/config";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { emailForResetToken } from "@/lib/password-reset";

import { resetPasswordAction, signOutForResetAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  password: `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: "The two passwords don't match — please try again.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  const { token, error } = await searchParams;

  // Expired, used, or malformed links get a clear dead end with a way out.
  const email = token ? await emailForResetToken(token) : null;
  if (!email || error === "expired") {
    if (user) redirect("/");
    const canEmail = smtpConfigured();
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">This link is no longer valid</h1>
        <p className="text-sm leading-relaxed text-archive-700">
          Reset links work once and expire after an hour.{" "}
          {canEmail
            ? "Request a new one and use it right away."
            : "Ask the person who runs your FamilyArchive for a new one."}
        </p>
        <p className="mt-4 text-sm">
          <Link
            href={canEmail ? "/forgot-password" : "/login"}
            className="text-accent-600 hover:underline"
          >
            {canEmail ? "Send me a new link" : "Back to sign in"}
          </Link>
        </p>
      </Card>
    );
  }

  // Someone who forgot their password can still be signed in on this device, and
  // Account settings can't help them without it. Sending them home would make the link
  // look broken, so say what's in the way.
  if (user) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Sign out to use this link</h1>
        <p className="text-sm leading-relaxed text-archive-700 [overflow-wrap:anywhere]">
          You&apos;re signed in as {user.email}. This link sets a new password for {email}, so you
          need to sign out first.
        </p>
        <form action={signOutForResetAction} className="mt-4">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className={`${buttonClass} w-full`}>
            Sign out and continue
          </button>
        </form>
        <p className="mt-4 text-sm">
          <Link href="/" className="text-accent-600 hover:underline">
            Back to your archive
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Choose a new password</h1>
      <p className="mb-4 text-sm text-archive-700">For {email}</p>
      <FormError message={error ? ERROR_MESSAGES[error] : undefined} className="mb-4" />
      <form action={resetPasswordAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label={`New password (min. ${MIN_PASSWORD_LENGTH} characters)`}>
          <input
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Field label="Repeat new password">
          <input
            name="confirm"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <button type="submit" className={`${buttonClass} w-full`}>
          Save new password
        </button>
      </form>
    </Card>
  );
}
