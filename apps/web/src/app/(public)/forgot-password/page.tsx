import { getSessionUser } from "@familyarchive/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass, Card, Field, inputClass } from "@/components/form";
import { smtpConfigured } from "@/lib/email";

import { requestPasswordResetAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { sent } = await searchParams;

  if (sent) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Check your email</h1>
        <p className="text-sm leading-relaxed text-archive-700">
          If that email belongs to an account here, we&apos;ve sent it a link to choose a new
          password. The link is valid for one hour.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-accent-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    );
  }

  if (!smtpConfigured()) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Reset your password</h1>
        <p className="text-sm leading-relaxed text-archive-700">
          This server isn&apos;t set up to send email, so passwords can&apos;t be reset
          automatically. Ask the person who runs your FamilyArchive to reset it for you.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-accent-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
      <p className="mb-4 text-sm text-archive-700/80">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>
      <form action={requestPasswordResetAction} className="space-y-4">
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <button type="submit" className={`${buttonClass} w-full`}>
          Send reset link
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-accent-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
