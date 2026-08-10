"use server";

import { requireMemberRole } from "@familyarchive/auth";
import { getDb, suggestions, treeMemberships, trees, users } from "@familyarchive/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { enqueueEmail, smtpConfigured } from "@/lib/email";
import { renderBrandedEmail } from "@familyarchive/shared";
import { getMediaItem } from "@/lib/media";
import { getPerson } from "@/lib/people";
import { getEnv } from "@familyarchive/config";

const TARGET_TYPES = new Set(["person", "media", "tree"]);

/** Submit a suggestion (any member); admins get emailed. */
export async function submitSuggestionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "") || null;
  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 10_000);
  const returnTo = String(formData.get("returnTo") ?? `/trees/${treeId}/suggestions`);
  const backPath =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : `/trees/${treeId}/suggestions`;
  const { user } = await requireMemberRole(treeId, "viewer");

  if (!message || !TARGET_TYPES.has(targetType)) {
    redirect(`${backPath}?error=${encodeURIComponent("Enter a suggestion message")}`);
  }
  // Validate the target belongs to this archive.
  let targetLabel = "the archive";
  if (targetType === "person" && targetId) {
    const person = await getPerson(treeId, targetId);
    if (!person) redirect(backPath);
    targetLabel = person.fullName;
  } else if (targetType === "media" && targetId) {
    const media = await getMediaItem(treeId, targetId);
    if (!media) redirect(backPath);
    targetLabel = media.title || media.originalFilename;
  }

  await getDb()
    .insert(suggestions)
    .values({
      treeId,
      targetType,
      targetId: targetType === "tree" ? null : targetId,
      message,
      suggestedBy: user.id,
    });

  // Notify archive admins when SMTP is configured. Best-effort: the suggestion
  // is already committed, so a Valkey hiccup here must not throw away the
  // user's submission by aborting the action after the write.
  try {
    if (smtpConfigured()) {
      const db = getDb();
      const [treeRows, admins] = await Promise.all([
        db.select({ name: trees.name }).from(trees).where(eq(trees.id, treeId)).limit(1),
        db
          .select({ email: users.email })
          .from(treeMemberships)
          .innerJoin(users, eq(treeMemberships.userId, users.id))
          .where(and(eq(treeMemberships.treeId, treeId), eq(treeMemberships.role, "admin"))),
      ]);
      const treeName = treeRows[0]?.name ?? "your archive";
      const submitter = user.name ?? user.email;
      for (const admin of admins) {
        if (admin.email === user.email) continue;
        const reviewUrl = `${getEnv().APP_URL}/trees/${treeId}/suggestions`;
        await enqueueEmail({
          to: admin.email,
          subject: `New suggestion for "${treeName}" on FamilyArchive`,
          text:
            `${submitter} suggested a correction for ${targetLabel} in "${treeName}":\n\n` +
            `${message}\n\n` +
            `Review it here:\n${reviewUrl}`,
          html: renderBrandedEmail({
            heading: `New suggestion for "${treeName}"`,
            bodyLines: [`${submitter} suggested a correction for ${targetLabel}:`, `“${message}”`],
            cta: { label: "Review the suggestion", url: reviewUrl },
          }),
        });
      }
    }
  } catch {
    // Swallowed deliberately — the worker's own failure logging covers delivery,
    // and the submission itself succeeded.
  }

  redirect(`${backPath}?suggested=1`);
}

/** Accept or reject a suggestion (admin). */
export async function resolveSuggestionAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 2000) || null;
  const { user } = await requireMemberRole(treeId, "admin");
  if (decision !== "accepted" && decision !== "rejected") return;

  await getDb()
    .update(suggestions)
    .set({
      status: decision,
      resolvedBy: user.id,
      resolvedAt: new Date(),
      resolutionNote: note,
    })
    .where(
      and(
        eq(suggestions.id, suggestionId),
        eq(suggestions.treeId, treeId),
        eq(suggestions.status, "open"),
      ),
    );
  revalidatePath(`/trees/${treeId}/suggestions`);
}
