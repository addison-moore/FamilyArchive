"use server";

import { requireTreeRole } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { mergePeople, type MergeFieldChoices } from "@/lib/merge";
import { getPerson } from "@/lib/people";

function choice(
  formData: FormData,
  name: string,
  allowBoth = false,
): "survivor" | "other" | "both" {
  const value = String(formData.get(name) ?? "survivor");
  if (value === "other") return "other";
  if (allowBoth && value === "both") return "both";
  return "survivor";
}

/** Manual person merge (PRD §10.5) — editor+, explicit typed confirmation. */
export async function mergePeopleAction(formData: FormData): Promise<void> {
  const treeId = String(formData.get("treeId") ?? "");
  const survivorId = String(formData.get("survivorId") ?? "");
  const otherId = String(formData.get("otherId") ?? "");
  const { user } = await requireTreeRole(treeId, "editor");

  const path = `/trees/${treeId}/people/${survivorId}/merge/${otherId}`;
  const fail = (message: string) => redirect(`${path}?error=${encodeURIComponent(message)}`);

  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "MERGE"
  ) {
    return fail('Type "MERGE" to confirm');
  }
  const [survivor, other] = await Promise.all([
    getPerson(treeId, survivorId),
    getPerson(treeId, otherId),
  ]);
  if (!survivor || !other) return fail("Person not found in this archive");

  const choices: MergeFieldChoices = {
    fullName: choice(formData, "fullName") as "survivor" | "other",
    gender: choice(formData, "gender") as "survivor" | "other",
    birth: choice(formData, "birth") as "survivor" | "other",
    death: choice(formData, "death") as "survivor" | "other",
    biography: choice(formData, "biography", true),
    notes: choice(formData, "notes", true),
  };

  try {
    await mergePeople(treeId, survivorId, otherId, choices, user.id);
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    return fail(error instanceof Error ? error.message : "Merge failed");
  }
  redirect(`/trees/${treeId}/people/${survivorId}?merged=1`);
}
