import { AuthorizationError, requireMemberRole } from "@familyarchive/auth";
import {
  DEFAULT_PAGE_SIZE,
  formatBytes,
  MEDIA_TYPE_LABELS,
  pageCount,
  parsePageSize,
  resolvePageNumber,
  treeRoleAtLeast,
  type TreeRole,
} from "@familyarchive/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Dropdown } from "@/components/dropdown";
import {
  Card,
  dangerButtonClass,
  Field,
  inputClass,
  popoverPanelClass,
  subtleButtonClass,
} from "@/components/form";
import { ListPager } from "@/components/list-pager";
import { TYPE_ICONS } from "@/components/media-thumb";
import { PersonAvatar } from "@/components/person-summary";
import { Alert, Badge, PageHeader, SegmentedLinks } from "@/components/ui";
import {
  listTrashedMedia,
  listTrashedPeople,
  parseTrashView,
  trashSummary,
  trashThumbUrl,
  trashUrl,
  type TrashedMedia,
  type TrashedPerson,
} from "@/lib/trash";

import {
  purgeMediaAction,
  purgePersonAction,
  restoreMediaAction,
  restorePersonAction,
  setTrashPageSizeAction,
} from "./actions";

const LINK_CLASS = "text-accent-600 hover:underline";

function deletedLine(item: { deletedAt: Date | null; deletedByName: string | null }): string {
  const when = item.deletedAt?.toLocaleDateString("en-US", { dateStyle: "medium" });
  return `${when ?? "Unknown date"} by ${item.deletedByName ?? "a former member"}`;
}

/** One entry: what it is on the left, what can be done with it on the right. */
function Row({
  picture,
  title,
  detail,
  note,
  actions,
}: {
  picture: ReactNode;
  title: string;
  detail: ReactNode;
  note?: ReactNode;
  actions: ReactNode;
}) {
  return (
    // `relative` for the removal panel, which hangs from the row on a phone.
    <li className="relative flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4">
      {picture}
      <div className="min-w-0 flex-1 basis-40 sm:basis-auto">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        <p className="text-xs text-archive-700">{detail}</p>
        {note && <div className="mt-1">{note}</div>}
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
        {actions}
      </div>
    </li>
  );
}

function RemoveControl({
  label = "Remove permanently…",
  description,
  action,
  fields,
}: {
  label?: string;
  description: string;
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
}) {
  return (
    <Dropdown
      className="sm:relative"
      summaryClassName={`${dangerButtonClass} block cursor-pointer list-none`}
      summary={label}
    >
      <div
        className={`${popoverPanelClass} absolute right-3 left-3 mt-2 space-y-3 text-left sm:right-0 sm:left-auto sm:w-80`}
      >
        <p className="text-sm text-archive-700">{description}</p>
        <form action={action} className="space-y-3">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Field label="Type REMOVE to confirm">
            <input
              name="confirm"
              required
              autoComplete="off"
              placeholder="REMOVE"
              className={inputClass}
            />
          </Field>
          <button type="submit" className={`${dangerButtonClass} w-full`}>
            Remove permanently
          </button>
        </form>
      </div>
    </Dropdown>
  );
}

function MediaEntry({
  treeId,
  item,
  canPurge,
}: {
  treeId: string;
  item: TrashedMedia;
  canPurge: boolean;
}) {
  return (
    <Row
      picture={
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-archive-100/50">
          {item.hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trashThumbUrl(treeId, item.id)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden="true" className="text-2xl">
              {TYPE_ICONS[item.mediaType] ?? "📁"}
            </span>
          )}
        </div>
      }
      title={item.name}
      detail={`${MEDIA_TYPE_LABELS[item.mediaType]} · ${formatBytes(item.bytes)} · Deleted ${deletedLine(item)}`}
      note={
        item.removing && (
          <>
            <Badge tone="danger">Removal didn&apos;t finish</Badge>{" "}
            {!canPurge && (
              <span className="text-xs text-archive-700">An admin can finish removing it.</span>
            )}
          </>
        )
      }
      actions={
        <>
          {!item.removing && (
            <form action={restoreMediaAction}>
              <input type="hidden" name="treeId" value={treeId} />
              <input type="hidden" name="mediaId" value={item.id} />
              <button type="submit" className={subtleButtonClass}>
                Restore
              </button>
            </form>
          )}
          {canPurge && (
            <RemoveControl
              label={item.removing ? "Try removing again…" : undefined}
              description={`Permanently removes ${item.name} (${formatBytes(item.bytes)}): the original file, its previews, text, tags and face boxes. This can't be undone. Only a backup or an earlier export can bring it back.`}
              action={purgeMediaAction}
              fields={{ treeId, mediaId: item.id }}
            />
          )}
        </>
      }
    />
  );
}

function PersonEntry({
  treeId,
  person,
  canPurge,
}: {
  treeId: string;
  person: TrashedPerson;
  canPurge: boolean;
}) {
  const lifespan = person.lifespan ? `${person.lifespan} · ` : "";
  return (
    <Row
      picture={<PersonAvatar name={person.fullName} />}
      title={person.fullName}
      detail={`${lifespan}Deleted ${deletedLine(person)}`}
      actions={
        <>
          <form action={restorePersonAction}>
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="personId" value={person.id} />
            <button type="submit" className={subtleButtonClass}>
              Restore
            </button>
          </form>
          {canPurge && (
            <RemoveControl
              description={`Permanently removes ${person.fullName}'s record, alternate names, relationships and photo tags. Photos and documents stay in the library. This can't be undone.`}
              action={purgePersonAction}
              fields={{ treeId, personId: person.id, view: "people" }}
            />
          )}
        </>
      }
    />
  );
}

function MergedEntry({
  treeId,
  person,
  canPurge,
}: {
  treeId: string;
  person: TrashedPerson;
  canPurge: boolean;
}) {
  const survivor = person.mergedInto;
  return (
    <Row
      picture={<PersonAvatar name={person.fullName} />}
      title={person.fullName}
      detail={
        <>
          Merged into{" "}
          {!survivor?.name ? (
            "a person who has since been removed"
          ) : survivor.live ? (
            <Link href={`/trees/${treeId}/people/${survivor.id}`} className={LINK_CLASS}>
              {survivor.name}
            </Link>
          ) : (
            `${survivor.name}, who is also in Trash`
          )}{" "}
          · {deletedLine(person)}
        </>
      }
      actions={
        canPurge && (
          <RemoveControl
            description={`Permanently removes this leftover record of ${person.fullName}. Everything that was merged stays where it is. This can't be undone.`}
            action={purgePersonAction}
            fields={{ treeId, personId: person.id, view: "merged" }}
          />
        )
      }
    />
  );
}

/** The archive's Trash: restore for editors and up, permanent removal for admins (PRD §5.8). */
export default async function TrashPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{
    view?: string;
    page?: string;
    size?: string;
    error?: string;
    duplicateOf?: string;
    restored?: string;
    removed?: string;
  }>;
}) {
  const { treeId } = await params;
  let role: TreeRole;
  try {
    ({ role } = await requireMemberRole(treeId, "editor"));
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const {
    view: viewParam,
    page: pageParam,
    size: sizeParam,
    error,
    duplicateOf,
    restored,
    removed,
  } = await searchParams;

  const view = parseTrashView(viewParam);
  const canPurge = treeRoleAtLeast(role, "admin");
  const summary = await trashSummary(treeId);
  const total = summary[view];

  const sizeInUrl = parsePageSize(sizeParam);
  const size = sizeInUrl ?? DEFAULT_PAGE_SIZE;
  const totalPages = pageCount(total, size);
  const page = resolvePageNumber(pageParam, totalPages);
  const paging = { limit: size, offset: (page - 1) * size };
  const [mediaEntries, peopleEntries] = await Promise.all([
    view === "media" ? listTrashedMedia(treeId, paging) : [],
    view === "media" ? [] : listTrashedPeople(treeId, view, paging),
  ]);
  const shown = view === "media" ? mediaEntries.length : peopleEntries.length;

  const views = [
    { view: "media" as const, label: `Media (${summary.media})` },
    { view: "people" as const, label: `People (${summary.people})` },
    // Only when there is something in it: most archives never merge anyone.
    ...(summary.merged > 0 || view === "merged"
      ? [{ view: "merged" as const, label: `Merged (${summary.merged})` }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Trash"
        description={
          <>
            Deleted people and files stay here until they&apos;re restored or an admin removes them
            permanently. Nothing is removed automatically.
            {summary.bytes > 0 &&
              ` Files in Trash use ${formatBytes(summary.bytes)} of storage until then.`}
          </>
        }
      />

      {error && (
        <Alert tone="danger">
          {error}
          {duplicateOf && (
            <>
              {" "}
              <Link href={`/trees/${treeId}/media/${duplicateOf}`} className="underline">
                Open the copy
              </Link>
            </>
          )}
        </Alert>
      )}
      {restored && (
        <Alert tone="success">
          Restored.{" "}
          <Link
            href={`/trees/${treeId}/${view === "media" ? "media" : "people"}/${restored}`}
            className="underline"
          >
            Open it
          </Link>
        </Alert>
      )}
      {removed && <Alert tone="success">Permanently removed.</Alert>}

      <SegmentedLinks
        label="What to show"
        items={views.map((item) => ({
          href: trashUrl(treeId, item.view),
          label: item.label,
          active: item.view === view,
        }))}
      />

      {view === "merged" && (
        <p className="text-sm text-archive-700">
          These people were merged into someone else. Everything they held moved to that person, so
          there is nothing to restore.
        </p>
      )}

      {total === 0 ? (
        <Card>
          <p className="text-sm text-archive-700">
            {view === "media" && "No media in Trash."}
            {view === "people" && "No people in Trash."}
            {view === "merged" && "No merged records."}
          </p>
        </Card>
      ) : (
        <>
          <ul className="divide-y divide-archive-100 rounded-xl border border-archive-100 bg-surface shadow-sm">
            {mediaEntries.map((item) => (
              <MediaEntry key={item.id} treeId={treeId} item={item} canPurge={canPurge} />
            ))}
            {peopleEntries.map((person) =>
              view === "merged" ? (
                <MergedEntry key={person.id} treeId={treeId} person={person} canPurge={canPurge} />
              ) : (
                <PersonEntry key={person.id} treeId={treeId} person={person} canPurge={canPurge} />
              ),
            )}
          </ul>
          <ListPager
            basePath={`/trees/${treeId}/trash`}
            params={{ view, ...(sizeInUrl ? { size: String(sizeInUrl) } : {}) }}
            page={page}
            totalPages={totalPages}
            shown={shown}
            total={total}
            size={size}
            label={view === "media" ? "items" : view === "people" ? "people" : "records"}
            sizeAction={setTrashPageSizeAction}
            actionFields={{ treeId }}
          />
        </>
      )}
    </div>
  );
}
