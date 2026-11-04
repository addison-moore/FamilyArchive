import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";
import { getDb, mediaFaces, mediaPeople, personNames, relationships } from "@familyarchive/db";
import { formatDateParts, GENDER_LABELS } from "@familyarchive/shared";
import { count, eq, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClass, Card, Field, FormError, inputClass } from "@/components/form";
import { PersonAvatar, personLifespan } from "@/components/person-summary";
import { Badge, PageHeader } from "@/components/ui";
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

/** Label, then the two records: three columns, or stacked on a phone. */
const COMPARE_GRID = "grid gap-x-4 gap-y-2 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]";

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
    <div
      role="radiogroup"
      aria-labelledby={`merge-${name}`}
      className={`${COMPARE_GRID} border-t border-archive-100 py-3`}
    >
      <div id={`merge-${name}`} className="text-sm font-medium">
        {label}
      </div>
      <label className="flex min-h-6 items-start gap-2 text-sm">
        <input
          type="radio"
          name={name}
          value="survivor"
          defaultChecked={defaultTo === "survivor"}
          className="mt-0.5"
        />
        <span className="min-w-0 whitespace-pre-line">
          {survivorValue || "—"}
          {/* The column headings are out of sight when a phone stacks the choices. */}
          <Badge className="ml-2 sm:hidden">survives</Badge>
        </span>
      </label>
      <div className="space-y-2">
        <label className="flex min-h-6 items-start gap-2 text-sm">
          <input
            type="radio"
            name={name}
            value="other"
            defaultChecked={defaultTo === "other"}
            className="mt-0.5"
          />
          <span className="min-w-0 whitespace-pre-line">
            {otherValue || "—"}
            <Badge className="ml-2 sm:hidden">merged away</Badge>
          </span>
        </label>
        {allowBoth && (
          <label className="flex min-h-6 items-start gap-2 text-sm text-archive-700">
            <input type="radio" name={name} value="both" className="mt-0.5" />
            keep both (combined)
          </label>
        )}
      </div>
    </div>
  );
}

/** Side-by-side compare & merge. The left person survives. */
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
      <PageHeader
        title="Merge people"
        description={
          <>
            <strong>{other.fullName}</strong> will be merged into{" "}
            <strong>{survivor.fullName}</strong> — the left column survives where you don&apos;t
            choose otherwise.{" "}
            <Link
              href={`/trees/${treeId}/people/${otherId}/merge/${personId}`}
              className="text-accent-600 hover:underline"
            >
              Swap direction
            </Link>
          </>
        }
      />
      <FormError message={error} />

      <form action={mergePeopleAction} className="space-y-6">
        <input type="hidden" name="treeId" value={treeId} />
        <input type="hidden" name="survivorId" value={personId} />
        <input type="hidden" name="otherId" value={otherId} />

        <Card>
          <div className={`${COMPARE_GRID} pb-3`}>
            <div className="hidden sm:block" />
            {[survivor, other].map((person, index) => (
              <div key={person.id} className="flex min-w-0 items-center gap-2.5">
                <PersonAvatar name={person.fullName} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{person.fullName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-archive-700">
                    <Badge>{index === 0 ? "survives" : "merged away"}</Badge>
                    {personLifespan(person) ?? "no dates"}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-semibold">Carried over automatically</h2>
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
            <Field label="Type MERGE to confirm" className="w-full sm:w-44">
              <input name="confirm" required className={inputClass} placeholder="MERGE" />
            </Field>
            <button type="submit" className={buttonClass}>
              Merge {other.fullName} into {survivor.fullName}
            </button>
          </div>
        </Card>
      </form>
    </div>
  );
}
