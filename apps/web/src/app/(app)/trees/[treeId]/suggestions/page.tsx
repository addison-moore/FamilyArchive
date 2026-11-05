import { requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaItems, people, suggestions, users } from "@familyarchive/db";
import { treeRoleAtLeast } from "@familyarchive/shared";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  Card,
  dangerButtonClass,
  Field,
  FormError,
  inputClass,
  successButtonClass,
} from "@/components/form";
import { SuggestForm } from "@/components/suggest-form";
import { Alert, Badge, PageHeader } from "@/components/ui";

import { resolveSuggestionAction } from "./actions";

const STATUS_TONE: Record<string, "warn" | "success" | "danger"> = {
  open: "warn",
  accepted: "success",
  rejected: "danger",
};

/** Suggestions: review queue for admins, own submissions for others. */
export default async function SuggestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ error?: string; suggested?: string }>;
}) {
  const { treeId } = await params;
  const { user, role, isMember } = await requireTreeRole(treeId, "viewer");
  const { error, suggested } = await searchParams;
  const isAdmin = treeRoleAtLeast(role, "admin");

  if (!user || !isMember) {
    // Visitors to a public archive cannot suggest or view suggestions, signed in or not.
    return (
      <Card>
        <p className="text-sm text-archive-700">
          {user
            ? "Only members of this archive can view and submit suggestions."
            : "Sign in to view and submit suggestions."}
        </p>
      </Card>
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      suggestion: suggestions,
      submitterName: users.name,
      submitterEmail: users.email,
      personName: people.fullName,
      personDeletedAt: people.deletedAt,
      mediaTitle: mediaItems.title,
      mediaFilename: mediaItems.originalFilename,
      mediaDeletedAt: mediaItems.deletedAt,
    })
    .from(suggestions)
    .innerJoin(users, eq(suggestions.suggestedBy, users.id))
    .leftJoin(people, eq(suggestions.targetId, people.id))
    .leftJoin(mediaItems, eq(suggestions.targetId, mediaItems.id))
    .where(eq(suggestions.treeId, treeId))
    .orderBy(desc(suggestions.createdAt));

  const visible = isAdmin ? rows : rows.filter((r) => r.suggestion.suggestedBy === user.id);
  const open = visible.filter((r) => r.suggestion.status === "open");
  const resolved = visible.filter((r) => r.suggestion.status !== "open");

  const targetLabel = (row: (typeof rows)[number]): { label: string; href: string | null } => {
    const s = row.suggestion;
    // Suggestions point at their target with no foreign key, so it can be in Trash or
    // gone for good, and neither has a page to link to.
    if (s.targetType === "person" && s.targetId) {
      if (!row.personName) return { label: "a person who was removed", href: null };
      return row.personDeletedAt
        ? { label: `${row.personName} (in Trash)`, href: null }
        : { label: row.personName, href: `/trees/${treeId}/people/${s.targetId}` };
    }
    if (s.targetType === "media" && s.targetId) {
      const name = row.mediaTitle ?? row.mediaFilename;
      if (!name) return { label: "an item that was removed", href: null };
      return row.mediaDeletedAt
        ? { label: `${name} (in Trash)`, href: null }
        : { label: name, href: `/trees/${treeId}/media/${s.targetId}` };
    }
    return { label: "the archive", href: null };
  };

  const SuggestionCard = ({ row }: { row: (typeof rows)[number] }) => {
    const s = row.suggestion;
    const target = targetLabel(row);
    return (
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{row.submitterName ?? row.submitterEmail}</span>{" "}
              <span className="text-archive-700">
                suggested for{" "}
                {target.href ? (
                  <Link href={target.href} className="text-accent-600 hover:underline">
                    {target.label}
                  </Link>
                ) : (
                  target.label
                )}{" "}
                · {s.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
              </span>
            </p>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-archive-800">
              {s.message}
            </p>
            {s.resolutionNote && (
              <p className="mt-2 rounded-md bg-archive-100/60 px-3 py-2 text-sm text-archive-700">
                <span className="font-medium">Admin note:</span> {s.resolutionNote}
              </p>
            )}
          </div>
          <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
        </div>
        {isAdmin && s.status === "open" && (
          <form action={resolveSuggestionAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="suggestionId" value={s.id} />
            <Field label="Note (optional)" className="w-full sm:w-auto sm:min-w-48 sm:flex-1">
              <input name="note" maxLength={2000} className={inputClass} />
            </Field>
            <button type="submit" name="decision" value="accepted" className={successButtonClass}>
              Accept
            </button>
            <button type="submit" name="decision" value="rejected" className={dangerButtonClass}>
              Reject
            </button>
          </form>
        )}
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Suggestions"
        description={
          isAdmin
            ? "Review corrections proposed by family members."
            : "Propose corrections for admins to review."
        }
      />
      <FormError message={error} />
      {suggested && <Alert>Suggestion sent — an admin will review it.</Alert>}

      {!treeRoleAtLeast(role, "editor") && (
        <SuggestForm
          treeId={treeId}
          targetType="tree"
          targetLabel="the archive"
          returnTo={`/trees/${treeId}/suggestions`}
        />
      )}

      {open.length === 0 && resolved.length === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            {isAdmin ? "No suggestions yet." : "You haven't submitted any suggestions yet."}
          </p>
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Open ({open.length})</h2>
              {open.map((row) => (
                <SuggestionCard key={row.suggestion.id} row={row} />
              ))}
            </section>
          )}
          {resolved.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Resolved ({resolved.length})</h2>
              {resolved.map((row) => (
                <SuggestionCard key={row.suggestion.id} row={row} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
