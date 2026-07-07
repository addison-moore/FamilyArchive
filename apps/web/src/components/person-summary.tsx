import { formatLifespan, RELATIONSHIP_TYPE_LABELS, treeRoleAtLeast } from "@familyarchive/shared";
import type { TreeRole } from "@familyarchive/shared";
import Link from "next/link";

import { buttonClass, subtleButtonClass } from "@/components/form";
import type { PersonRow, RelationshipGraph } from "@/lib/people";

export function PersonAvatar({
  name,
  size = "md",
  photoUrl,
}: {
  name: string;
  size?: "md" | "lg";
  photoUrl?: string | null;
}) {
  const sizeClass = size === "lg" ? "h-20 w-20 text-2xl" : "h-12 w-12 text-base";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        aria-hidden="true"
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden="true"
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-archive-100 font-semibold text-archive-700`}
    >
      {initials || "?"}
    </div>
  );
}

export function personLifespan(person: PersonRow): string | null {
  return formatLifespan(
    {
      year: person.birthYear,
      month: person.birthMonth,
      day: person.birthDay,
      approx: person.birthApprox,
    },
    {
      year: person.deathYear,
      month: person.deathMonth,
      day: person.deathDay,
      approx: person.deathApprox,
    },
  );
}

/**
 * Person summary sidebar (PRD §11.3): photo, name, dates, key relationships,
 * biography preview, permission-aware actions. Used on the People page now and
 * mounted beside the tree canvas in Milestone 4.
 */
export function PersonSummary({
  treeId,
  person,
  graph,
  role,
  photoUrl,
}: {
  treeId: string;
  person: PersonRow;
  graph: RelationshipGraph;
  role: TreeRole;
  photoUrl?: string | null;
}) {
  const profileHref = `/trees/${treeId}/people/${person.id}`;
  const bioPreview =
    person.biography && person.biography.length > 240
      ? `${person.biography.slice(0, 240)}…`
      : person.biography;

  const relationshipLines: { label: string; names: string }[] = [];
  if (graph.parents.length > 0) {
    relationshipLines.push({
      label: "Parents",
      names: graph.parents.map((r) => r.person.fullName).join(", "),
    });
  }
  if (graph.partners.length > 0) {
    relationshipLines.push({
      label: "Partners",
      names: graph.partners
        .map((r) => `${r.person.fullName} (${RELATIONSHIP_TYPE_LABELS[r.type].toLowerCase()})`)
        .join(", "),
    });
  }
  if (graph.children.length > 0) {
    relationshipLines.push({
      label: "Children",
      names: graph.children.map((r) => r.person.fullName).join(", "),
    });
  }

  return (
    <aside className="rounded-xl border border-archive-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <PersonAvatar name={person.fullName} size="lg" photoUrl={photoUrl} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{person.fullName}</h2>
          {personLifespan(person) && (
            <p className="text-sm text-archive-700/80">{personLifespan(person)}</p>
          )}
        </div>
      </div>

      {relationshipLines.length > 0 && (
        <dl className="mt-4 space-y-1 text-sm">
          {relationshipLines.map((line) => (
            <div key={line.label}>
              <dt className="inline font-medium">{line.label}: </dt>
              <dd className="inline text-archive-700">{line.names}</dd>
            </div>
          ))}
        </dl>
      )}

      {bioPreview && <p className="mt-4 text-sm leading-relaxed text-archive-700">{bioPreview}</p>}

      <div className="mt-5 text-xs">
        <Link
          href={`/trees/${treeId}/media?person=${person.id}`}
          className="text-accent-600 hover:underline"
        >
          View tagged media →
        </Link>
      </div>

      <div className="mt-5 flex gap-2">
        <Link href={profileHref} className={`${buttonClass} no-underline`}>
          View profile
        </Link>
        {treeRoleAtLeast(role, "editor") && (
          <Link href={`${profileHref}/edit`} className={`${subtleButtonClass} no-underline`}>
            Edit
          </Link>
        )}
      </div>
    </aside>
  );
}
