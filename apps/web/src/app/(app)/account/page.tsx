import { getSessionUser, MIN_PASSWORD_LENGTH } from "@familyarchive/auth";
import { smtpConfigured } from "@familyarchive/config";
import { redirect } from "next/navigation";

import { AppHeader, PageBody } from "@/components/app-header";
import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { Alert, PageHeader } from "@/components/ui";

import { changeEmailAction, changePasswordAction, updateNameAction } from "./actions";

// Maps because the keys come from the URL: on an object, ?error=constructor would find
// Object's constructor and fail the page trying to render it.
const ERROR_MESSAGES = new Map([
  ["name", "Enter your name."],
  ["email", "Enter a valid email address."],
  ["sameEmail", "That's already your email address."],
  ["taken", "That email address belongs to another account."],
  ["wrong", "Your current password wasn't right."],
  ["throttled", "Too many attempts. Try again in a few minutes."],
  ["password", `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`],
  ["mismatch", "The two new passwords don't match."],
  ["samePassword", "That's already your password. Choose a different one."],
]);

const SAVED_MESSAGES = new Map([
  ["name", "Your name has been updated."],
  ["email", "Your email has been changed. Use the new address to sign in from now on."],
  ["password", "Your password has been changed. You've been signed out everywhere else."],
]);

function forgottenPasswordHint(isOwner: boolean): string {
  if (smtpConfigured()) {
    return "Forgot your current password? Sign out, then use “Forgot your password?” on the sign-in page.";
  }
  return isOwner
    ? "Forgot your current password? See “Accounts and passwords” in the self-hosting guide."
    : "Forgot your current password? Ask the person who runs this FamilyArchive for a reset link.";
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/account");
  const { error, saved } = await searchParams;
  const savedMessage = SAVED_MESSAGES.get(saved ?? "");

  return (
    <>
      <AppHeader />
      <PageBody>
        <div className="mx-auto max-w-xl space-y-6">
          <PageHeader title="Account settings" />
          <FormError message={ERROR_MESSAGES.get(error ?? "")} />
          {savedMessage && <Alert tone="success">{savedMessage}</Alert>}

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Name</h2>
            <form action={updateNameAction} aria-label="Change name" className="space-y-4">
              <Field label="Your name">
                <input
                  name="name"
                  required
                  maxLength={200}
                  autoComplete="name"
                  defaultValue={user.name ?? ""}
                  className={inputClass}
                />
              </Field>
              <button type="submit" className={buttonClass}>
                Save name
              </button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold">Email</h2>
            <p className="mb-4 text-sm text-archive-700 [overflow-wrap:anywhere]">
              You sign in with <strong>{user.email}</strong>.
            </p>
            <form action={changeEmailAction} aria-label="Change email" className="space-y-4">
              <Field label="New email">
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </Field>
              <Field label="Current password">
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </Field>
              <button type="submit" className={buttonClass}>
                Change email
              </button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold">Password</h2>
            <p className="mb-4 text-sm text-archive-700">
              Changing your password signs you out everywhere else.
            </p>
            <form action={changePasswordAction} aria-label="Change password" className="space-y-4">
              <Field label="Current password">
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </Field>
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
              <button type="submit" className={buttonClass}>
                Change password
              </button>
            </form>
            <p className="mt-4 text-sm text-archive-700">
              {forgottenPasswordHint(user.role === "owner")}
            </p>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
