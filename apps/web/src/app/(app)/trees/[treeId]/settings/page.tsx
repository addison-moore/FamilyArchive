import { AuthorizationError, requireMemberRole, type SessionUser } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { notFound } from "next/navigation";
import { getDb, invites, treeMemberships, trees, users } from "@familyarchive/db";
import { TREE_ROLES } from "@familyarchive/shared";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import {
  buttonClass,
  Card,
  dangerButtonClass,
  Field,
  FormError,
  inputClass,
  subtleButtonClass,
} from "@/components/form";
import { smtpConfigured } from "@/lib/email";

import { ExportStatusPoller } from "@/components/export-status-poller";
import { latestExport } from "@/lib/export";

import {
  changeMemberRoleAction,
  createInviteAction,
  deleteTreeAction,
  removeMemberAction,
  requestArchiveExportAction,
  revokeInviteAction,
  setPublicModeAction,
  updateTreeAction,
} from "./actions";
import Link from "next/link";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function TreeSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ error?: string; invite?: string; emailed?: string; smtp?: string }>;
}) {
  const { treeId } = await params;
  let user: SessionUser;
  try {
    ({ user } = await requireMemberRole(treeId, "admin"));
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const { error, invite: createdToken, emailed, smtp } = await searchParams;

  const db = getDb();
  const exportRow = await latestExport(treeId);
  const [treeRows, members, activeInvites] = await Promise.all([
    db.select().from(trees).where(eq(trees.id, treeId)).limit(1),
    db
      .select({
        membershipId: treeMemberships.id,
        role: treeMemberships.role,
        userId: users.id,
        name: users.name,
        email: users.email,
      })
      .from(treeMemberships)
      .innerJoin(users, eq(treeMemberships.userId, users.id))
      .where(eq(treeMemberships.treeId, treeId))
      .orderBy(desc(treeMemberships.createdAt)),
    db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.treeId, treeId),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invites.createdAt)),
  ]);
  const tree = treeRows[0];
  if (!tree) return null;

  const appUrl = getEnv().APP_URL;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Archive settings</h1>
      <FormError message={error} />

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Details</h2>
        <form action={updateTreeAction} className="space-y-4">
          <input type="hidden" name="treeId" value={treeId} />
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={tree.name}
              className={inputClass}
            />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={tree.description ?? ""}
              className={inputClass}
            />
          </Field>
          <button type="submit" className={buttonClass}>
            Save
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Members</h2>
        <ul className="divide-y divide-archive-100">
          {members.map((member) => (
            <li key={member.membershipId} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{member.name ?? member.email}</div>
                <div className="truncate text-sm text-archive-700/70">{member.email}</div>
              </div>
              <form action={changeMemberRoleAction} className="flex items-center gap-2">
                <input type="hidden" name="treeId" value={treeId} />
                <input type="hidden" name="membershipId" value={member.membershipId} />
                <select name="role" defaultValue={member.role} className={`${inputClass} w-auto`}>
                  {TREE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button type="submit" className={subtleButtonClass}>
                  Update
                </button>
              </form>
              {member.userId !== user.id && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="treeId" value={treeId} />
                  <input type="hidden" name="membershipId" value={member.membershipId} />
                  <button type="submit" className={dangerButtonClass}>
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 id="invites" className="mb-1 text-lg font-semibold">
          Invites
        </h2>
        <p className="mb-4 text-sm text-archive-700/80">
          Invite links expire automatically and grant only the role you choose.
          {!smtpConfigured() &&
            " SMTP is not configured — create a link and share it yourself (email delivery is disabled)."}
        </p>

        {createdToken && (
          <div className="mb-4 rounded-md border border-accent-600/30 bg-archive-100/50 p-3">
            <p className="mb-2 text-sm font-medium">
              Invite created{emailed ? " and emailed" : ""}
              {smtp === "0" ? " — SMTP is not configured, so share the link manually" : ""}:
            </p>
            <input
              readOnly
              value={`${appUrl}/invite/${createdToken}`}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        )}

        <form action={createInviteAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="treeId" value={treeId} />
          <Field label="Role">
            <select name="role" defaultValue="viewer" className={`${inputClass} w-auto`}>
              {TREE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expires (days)">
            <input
              name="expiresInDays"
              type="number"
              min={1}
              max={90}
              defaultValue={7}
              className={`${inputClass} w-24`}
            />
          </Field>
          <Field label="Email to (optional)">
            <input
              name="email"
              type="email"
              placeholder="relative@example.com"
              className={inputClass}
            />
          </Field>
          <button type="submit" className={buttonClass}>
            Create invite
          </button>
        </form>

        {activeInvites.length > 0 && (
          <ul className="mt-6 divide-y divide-archive-100">
            {activeInvites.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="rounded bg-archive-100 px-1.5 py-0.5 text-xs">
                      {item.role}
                    </span>{" "}
                    {item.email ?? "link only"}
                  </div>
                  <div className="truncate font-mono text-xs text-archive-700/70">
                    {appUrl}/invite/{item.token}
                  </div>
                  <div className="text-xs text-archive-700/60">
                    expires {item.expiresAt.toDateString()}
                  </div>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="treeId" value={treeId} />
                  <input type="hidden" name="inviteId" value={item.id} />
                  <button type="submit" className={dangerButtonClass}>
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Public access</h2>
        <p className="mb-4 text-sm text-archive-700/80">
          Archives are private by default. Public mode lets anyone with the link view the
          <strong> entire archive</strong> — tree, people, and all media — without an account.
        </p>
        <form action={setPublicModeAction} className="space-y-3">
          <input type="hidden" name="treeId" value={treeId} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPublic" defaultChecked={tree.isPublic} />
            Make this archive publicly viewable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowIndexing" defaultChecked={tree.allowIndexing} />
            Allow search engines to index it (otherwise noindex is sent)
          </label>
          <button type="submit" className={buttonClass}>
            Save public access
          </button>
        </form>
        {tree.isPublic && (
          <p className="mt-3 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">
            This archive is currently public.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Audit log</h2>
        <p className="mb-3 text-sm text-archive-700/80">
          A record of important changes, visible to admins only.
        </p>
        <Link
          href={`/trees/${treeId}/settings/audit`}
          className={`${subtleButtonClass} inline-block no-underline`}
        >
          View audit log
        </Link>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">GEDCOM export</h2>
        <p className="mb-4 text-sm text-archive-700/80">
          Download this archive as a GEDCOM file — the standard format other family-tree apps can
          open. Photos and files are not included.
        </p>
        <a
          href={`/api/trees/${treeId}/gedcom`}
          className={`${subtleButtonClass} inline-block no-underline`}
          download
        >
          Download .ged file
        </a>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Export everything</h2>
        <p className="mb-4 text-sm text-archive-700/80">
          Download this entire archive — the family tree, every original photo and file, and all
          details — as a single ZIP. Useful as a backup, and everything you&apos;d need to move to
          another server.
        </p>

        {exportRow?.status === "pending" || exportRow?.status === "running" ? (
          <div className="text-sm text-archive-700">
            <ExportStatusPoller treeId={treeId} />
            Preparing your export… this can take a while for large archives. You can leave this page
            {smtpConfigured() ? " — we'll email you when it's ready." : "."}
          </div>
        ) : (
          <>
            {exportRow?.status === "complete" && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-archive-100 bg-archive-50 px-4 py-3 text-sm">
                <span className="text-archive-700">
                  Ready: exported{" "}
                  {exportRow.completedAt?.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  · {formatBytes(exportRow.fileSize)}
                  {exportRow.expiresAt && (
                    <>
                      {" "}
                      · available until{" "}
                      {exportRow.expiresAt.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      })}
                    </>
                  )}
                </span>
                <a
                  href={`/api/trees/${treeId}/export/download`}
                  className={`${buttonClass} inline-block no-underline`}
                >
                  Download
                </a>
              </div>
            )}
            {exportRow?.status === "failed" && (
              <p className="mb-4 text-sm text-danger">
                The last export didn&apos;t finish{exportRow.error ? ` (${exportRow.error})` : ""} —
                try again below.
              </p>
            )}
            <form action={requestArchiveExportAction} className="space-y-3">
              <input type="hidden" name="treeId" value={treeId} />
              <label className="flex items-center gap-2 text-sm text-archive-700">
                <input type="checkbox" name="includeDeleted" />
                Also include people and files that were deleted
              </label>
              <button type="submit" className={subtleButtonClass}>
                {exportRow?.status === "complete" ? "Export a fresh copy" : "Export archive"}
              </button>
            </form>
          </>
        )}
      </Card>

      {user.role === "owner" && (
        <Card>
          <h2 id="danger" className="mb-1 text-lg font-semibold text-danger">
            Danger zone
          </h2>
          <p className="mb-4 text-sm text-archive-700/80">
            Deleting an archive permanently removes its people, media records, memberships, and
            invites. Type the archive name (<strong>{tree.name}</strong>) to confirm.
          </p>
          <form action={deleteTreeAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="treeId" value={treeId} />
            <input
              name="confirmName"
              required
              placeholder={tree.name}
              className={`${inputClass} w-64`}
            />
            <button type="submit" className={dangerButtonClass}>
              Delete archive
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
