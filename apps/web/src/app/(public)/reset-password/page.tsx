import { getSessionUser, MIN_PASSWORD_LENGTH } from "@familyarchive/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { emailForResetToken } from "@/lib/password-reset";

import { resetPasswordAction } from "./actions";

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
  if (user) redirect("/");
  const { token, error } = await searchParams;

  // Expired, used, or malformed links get a clear dead end with a way out.
  const email = token ? await emailForResetToken(token) : null;
  if (!email || error === "expired") {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">This link is no longer valid</h1>
        <p className="text-sm leading-relaxed text-archive-700">
          Reset links work once and expire after an hour. Request a new one and use it right away.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className="text-accent-600 hover:underline">
            Send me a new link
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Choose a new password</h1>
      <p className="mb-4 text-sm text-archive-700/80">For {email}</p>
      <FormError message={error ? ERROR_MESSAGES[error] : undefined} />
      <form action={resetPasswordAction} className="mt-4 space-y-4">
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
