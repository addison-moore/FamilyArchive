import { getSessionUser } from "@familyarchive/auth";
import { smtpConfigured } from "@familyarchive/config";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader, PageBody } from "@/components/app-header";
import {
  dangerButtonClass,
  disclosureBodyClass,
  disclosureClass,
  disclosureSummaryClass,
  Field,
  FormError,
  inputClass,
} from "@/components/form";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { listUsersWithArchives, type ManagedUser } from "@/lib/user-admin";

import { removeUserAction } from "./actions";
import { ResetLink } from "./reset-link";

// A Map because the key comes from the URL: see the account page.
const ERROR_MESSAGES = new Map([
  ["mismatch", "To remove an account, type that person's email exactly."],
  ["missing", "That account no longer exists."],
  ["owner", "The owner's account can't be removed."],
]);

function RemoveAccount({ account, label }: { account: ManagedUser; label: string }) {
  const soleAdminOf = account.archives.filter((archive) => archive.soleAdmin);

  return (
    <details className={disclosureClass}>
      <summary className={disclosureSummaryClass}>Remove account</summary>
      <div className={disclosureBodyClass}>
        <p className="text-sm">
          This ends {label}&apos;s sign-in and removes them from their archives. It can&apos;t be
          undone.
        </p>
        <p className="text-sm text-archive-700">
          What they added stays: people, media, collections, suggestions and audit entries. Invite
          links they created or were sent stop working, but a link someone else handed them keeps
          working until it expires or is revoked in that archive&apos;s settings. They can come back
          with a new invite, as a new account.
        </p>
        {soleAdminOf.length > 0 && (
          <Alert tone="warn">
            They&apos;re the only admin of {soleAdminOf.map((archive) => archive.name).join(", ")}.
            After this, only you can manage{" "}
            {soleAdminOf.length === 1 ? "that archive" : "those archives"} until you make someone
            else an admin.
          </Alert>
        )}
        <form action={removeUserAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="userId" value={account.id} />
          <Field label={`Type ${account.email} to confirm`} className="min-w-48 flex-1">
            <input
              name="confirmEmail"
              required
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
          <button type="submit" className={dangerButtonClass}>
            Remove account
          </button>
        </form>
      </div>
    </details>
  );
}

function UserRow({ account, isYou }: { account: ManagedUser; isYou: boolean }) {
  const label = account.name ?? account.email;
  const isOwner = account.role === "owner";

  return (
    <li className="rounded-xl border border-archive-100 bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium [overflow-wrap:anywhere]">{label}</span>
        {isOwner && <Badge>owner</Badge>}
        {isYou && <Badge>you</Badge>}
      </div>
      <div className="text-sm text-archive-700 [overflow-wrap:anywhere]">{account.email}</div>
      <div className="text-sm text-archive-700">
        Joined {account.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
      </div>

      <div className="mt-3 text-sm">
        {isOwner ? (
          <span className="text-archive-700">All archives</span>
        ) : account.archives.length === 0 ? (
          <span className="text-archive-700">No archives</span>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {account.archives.map((archive) => (
              <li key={archive.id} className="flex items-center gap-1.5">
                <Link
                  href={`/trees/${archive.id}`}
                  className="text-accent-600 [overflow-wrap:anywhere] hover:underline"
                >
                  {archive.name}
                </Link>
                <Badge className="capitalize">{archive.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isOwner && (
        <div className="mt-4 space-y-3">
          <ResetLink userId={account.id} label={label} />
          <RemoveAccount account={account} label={label} />
        </div>
      )}
    </li>
  );
}

export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; removed?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/admin/users");
  if (user.role !== "owner") notFound();
  const { error, removed } = await searchParams;
  const accounts = await listUsersWithArchives();

  return (
    <>
      <AppHeader />
      <PageBody>
        <div className="mx-auto max-w-3xl">
          <PageHeader
            title="Manage users"
            description="Everyone with an account here. Roles are set in each archive's settings."
          />
          <div className="space-y-3">
            <FormError message={ERROR_MESSAGES.get(error ?? "")} />
            {removed && <Alert tone="success">The account has been removed.</Alert>}
            {!smtpConfigured() && (
              <Alert>
                This server can&apos;t send email, so someone who forgets their password needs a
                reset link from you.
              </Alert>
            )}
            <ul className="space-y-3">
              {accounts.map((account) => (
                <UserRow key={account.id} account={account} isYou={account.id === user.id} />
              ))}
            </ul>
          </div>
        </div>
      </PageBody>
    </>
  );
}
