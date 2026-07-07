import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaFaces, mediaPeople, personNames, relationships } from "@familyarchive/db";
import { formatDateParts, GENDER_LABELS } from "@familyarchive/shared";
import { count, eq, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClass, Card, FormError, inputClass } from "@/components/form";
import { PersonAvatar, personLifespan } from "@/components/person-summary";
import { getPerson, getPlaceName, type PersonRow } from "@/lib/people";

import { mergePeopleAction } from "./actions";

function birthText(person: PersonRow, place: string | null): string {
  const date = formatDateParts({
    year: person.birthYear,
    month: person.birthMonth,
    day: person.birthDay,
    approx: person.birthApprox,
  });
  return [date, place].filter(Boolean).join(" · ") || "—";
}

function deathText(person: PersonRow, place: string | null): string {
  const date = formatDateParts({
    year: person.deathYear,
    month: person.deathMonth,
    day: person.deathDay,
    approx: person.deathApprox,
  });
  return [date, place].filter(Boolean).join(" · ") || "—";
}

function ChoiceRow({
  label,
  name,
  survivorValue,
  otherValue,
  allowBoth = false,
  defaultTo,
}: {
  label: string;
  name: string;
  survivorValue: string;
  otherValue: string;
  allowBoth?: boolean;
  defaultTo: "survivor" | "other";
}) {
  return (
    <tr className="border-t border-archive-100 align-top">
      <th className="py-2.5 pr-3 text-left text-sm font-medium whitespace-nowrap">{label}</th>
      <td className="px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name={name}
            value="survivor"
            defaultChecked={defaultTo === "survivor"}
          />
          <span className="whitespace-pre-line">{survivorValue || "—"}</span>
        </label>
      </td>
      <td className="px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" name={name} value="other" defaultChecked={defaultTo === "other"} />
          <span className="whitespace-pre-line">{otherValue || "—"}</span>
        </label>
        {allowBoth && (
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-archive-700/80">
            <input type="radio" name={name} value="both" />
            keep both (combined)
          </label>
        )}
      </td>
    </tr>
  );
}

/** Side-by-side compare & merge (PRD §10.5). The left person survives. */
export default async function MergePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string; personId: string; otherId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { treeId, personId, otherId } = await params;
  try {
    await requireTreeRole(treeId, "editor");
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const { error } = await searchParams;

  const [survivor, other] = await Promise.all([
    getPerson(treeId, personId),
    getPerson(treeId, otherId),
  ]);
  if (!survivor || !other || survivor.id === other.id) notFound();

  const db = getDb();
  const [
    sBirthPlace,
    sDeathPlace,
    oBirthPlace,
    oDeathPlace,
    edgeCount,
    mediaTagCount,
    faceCount,
    nameCount,
  ] = await Promise.all([
    getPlaceName(survivor.birthPlaceId),
    getPlaceName(survivor.deathPlaceId),
    getPlaceName(other.birthPlaceId),
    getPlaceName(other.deathPlaceId),
    db
      .select({ value: count() })
      .from(relationships)
      .where(or(eq(relationships.fromPersonId, otherId), eq(relationships.toPersonId, otherId))),
    db.select({ value: count() }).from(mediaPeople).where(eq(mediaPeople.personId, otherId)),
    db.select({ value: count() }).from(mediaFaces).where(eq(mediaFaces.personId, otherId)),
    db.select({ value: count() }).from(personNames).where(eq(personNames.personId, otherId)),
  ]);

  const prefer = (s: string | null, o: string | null): "survivor" | "other" =>
    !s?.trim() && o?.trim() ? "other" : "survivor";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Merge people</h1>
        <p className="mt-1 text-sm text-archive-700/80">
          <strong>{other.fullName}</strong> will be merged into <strong>{survivor.fullName}</strong>{" "}
          — the left column survives where you don&apos;t choose otherwise.{" "}
          <Link
            href={`/trees/${treeId}/people/${otherId}/merge/${personId}`}
            className="text-accent-600 hover:underline"
          >
            Swap direction
          </Link>
        </p>
      </div>
      <FormError message={error} />

      <form action={mergePeopleAction} className="space-y-6">
        <input type="hidden" name="treeId" value={treeId} />
        <input type="hidden" name="survivorId" value={personId} />
        <input type="hidden" name="otherId" value={otherId} />

        <Card>
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-28" />
                {[survivor, other].map((person, index) => (
                  <th key={person.id} className="px-3 pb-3 text-left">
                    <div className="flex items-center gap-2.5">
                      <PersonAvatar name={person.fullName} />
                      <div>
                        <div className="text-sm font-semibold">
                          {person.fullName}
                          <span className="ml-2 rounded bg-archive-100 px-1.5 py-0.5 text-[10px] font-normal">
                            {index === 0 ? "survives" : "merged away"}
                          </span>
                        </div>
                        <div className="text-xs font-normal text-archive-700/70">
                          {personLifespan(person) ?? "no dates"}
                        </div>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <ChoiceRow
                label="Name"
                name="fullName"
                survivorValue={survivor.fullName}
                otherValue={other.fullName}
                defaultTo="survivor"
              />
              <ChoiceRow
                label="Gender"
                name="gender"
                survivorValue={
                  survivor.gender === "custom"
                    ? (survivor.genderCustom ?? "Custom")
                    : GENDER_LABELS[survivor.gender]
                }
                otherValue={
                  other.gender === "custom"
                    ? (other.genderCustom ?? "Custom")
                    : GENDER_LABELS[other.gender]
                }
                defaultTo={
                  survivor.gender === "unknown" && other.gender !== "unknown" ? "other" : "survivor"
                }
              />
              <ChoiceRow
                label="Birth"
                name="birth"
                survivorValue={birthText(survivor, sBirthPlace)}
                otherValue={birthText(other, oBirthPlace)}
                defaultTo={
                  survivor.birthYear === null && other.birthYear !== null ? "other" : "survivor"
                }
              />
              <ChoiceRow
                label="Death"
                name="death"
                survivorValue={deathText(survivor, sDeathPlace)}
                otherValue={deathText(other, oDeathPlace)}
                defaultTo={
                  survivor.deathYear === null && other.deathYear !== null ? "other" : "survivor"
                }
              />
              <ChoiceRow
                label="Biography"
                name="biography"
                survivorValue={survivor.biography ?? ""}
                otherValue={other.biography ?? ""}
                allowBoth
                defaultTo={prefer(survivor.biography, other.biography)}
              />
              <ChoiceRow
                label="Notes"
                name="notes"
                survivorValue={survivor.notes ?? ""}
                otherValue={other.notes ?? ""}
                allowBoth
                defaultTo={prefer(survivor.notes, other.notes)}
              />
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold">Carried over automatically</h2>
          <p className="text-sm text-archive-700">
            {edgeCount[0]?.value ?? 0} relationship(s), {mediaTagCount[0]?.value ?? 0} media tag(s),{" "}
            {faceCount[0]?.value ?? 0} face tag(s), and {nameCount[0]?.value ?? 0} alternate name(s)
            from {other.fullName} move to {survivor.fullName}. Duplicate relationships collapse;
            both names are kept; raw GEDCOM provenance from both records is preserved.{" "}
            {other.fullName}&apos;s record is retired with a pointer to the merged person.
          </p>
        </Card>

        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Type <strong>MERGE</strong> to confirm
              </label>
              <input name="confirm" required className={`${inputClass} w-40`} placeholder="MERGE" />
            </div>
            <button type="submit" className={buttonClass}>
              Merge {other.fullName} into {survivor.fullName}
            </button>
          </div>
        </Card>
      </form>
    </div>
  );
}
