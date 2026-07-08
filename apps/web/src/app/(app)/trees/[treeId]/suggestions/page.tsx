import { requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaItems, people, suggestions, users } from "@familyarchive/db";
import { treeRoleAtLeast } from "@familyarchive/shared";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { Card, Field, FormError, inputClass } from "@/components/form";
import { SuggestForm } from "@/components/suggest-form";

import { resolveSuggestionAction } from "./actions";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

/** Suggestions (PRD §21): review queue for admins, own submissions for others. */
export default async function SuggestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ error?: string; suggested?: string }>;
}) {
  const { treeId } = await params;
  const { user, role } = await requireTreeRole(treeId, "viewer");
  const { error, suggested } = await searchParams;
  const isAdmin = treeRoleAtLeast(role, "admin");

  if (!user) {
    // Public visitors cannot suggest or view suggestions (PRD §4.6).
    return (
      <Card>
        <p className="text-sm text-archive-700">Sign in to view and submit suggestions.</p>
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
      mediaTitle: mediaItems.title,
      mediaFilename: mediaItems.originalFilename,
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
    if (s.targetType === "person" && s.targetId) {
      return {
        label: row.personName ?? "a person",
        href: `/trees/${treeId}/people/${s.targetId}`,
      };
    }
    if (s.targetType === "media" && s.targetId) {
      return {
        label: row.mediaTitle ?? row.mediaFilename ?? "a media item",
        href: `/trees/${treeId}/media/${s.targetId}`,
      };
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
              <span className="text-archive-700/70">
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
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? ""}`}
          >
            {s.status}
          </span>
        </div>
        {isAdmin && s.status === "open" && (
          <form action={resolveSuggestionAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="suggestionId" value={s.id} />
            <Field label="Note (optional)">
              <input name="note" maxLength={2000} className={`${inputClass} w-72`} />
            </Field>
            <button
              type="submit"
              name="decision"
              value="accepted"
              className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700/90"
            >
              Accept
            </button>
            <button
              type="submit"
              name="decision"
              value="rejected"
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              Reject
            </button>
          </form>
        )}
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Suggestions</h1>
        <p className="mt-1 text-sm text-archive-700/80">
          {isAdmin
            ? "Review corrections proposed by family members. Accepting records the decision — apply the edit itself through normal editing."
            : "Propose corrections for admins to review."}
        </p>
      </div>
      <FormError message={error} />
      {suggested && (
        <div className="rounded-md border border-accent-600/30 bg-archive-100/60 px-4 py-3 text-sm text-archive-800">
          Suggestion sent — an admin will review it.
        </div>
      )}

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
