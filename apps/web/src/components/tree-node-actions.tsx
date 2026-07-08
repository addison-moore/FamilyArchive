import {
  PARENT_RELATIONSHIP_TYPES,
  PARTNER_RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  treeRoleAtLeast,
  type RelationshipType,
  type TreeRole,
} from "@familyarchive/shared";

import { Field, inputClass, subtleButtonClass } from "@/components/form";
import {
  quickAddRelativeAction,
  setStartingPersonAction,
} from "@/app/(app)/trees/[treeId]/actions";

function QuickAddForm({
  treeId,
  personId,
  mode,
  direction,
  label,
  types,
}: {
  treeId: string;
  personId: string;
  mode: string;
  direction: "parent" | "partner" | "child";
  label: string;
  types: readonly RelationshipType[];
}) {
  return (
    <details className="rounded-md border border-archive-100 p-2.5">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      <form action={quickAddRelativeAction} className="mt-3 space-y-3">
        <input type="hidden" name="treeId" value={treeId} />
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="direction" value={direction} />
        <input type="hidden" name="mode" value={mode} />
        <Field label="Full name">
          <input name="fullName" required maxLength={300} className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Type">
            <select name="type" className={`${inputClass} w-44`}>
              {types.map((type) => (
                <option key={type} value={type}>
                  {RELATIONSHIP_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Birth year (optional)">
            <input
              name="birthYear"
              type="number"
              min={1}
              max={9999}
              className={`${inputClass} w-28`}
            />
          </Field>
          <button type="submit" className={subtleButtonClass}>
            Add
          </button>
        </div>
      </form>
    </details>
  );
}

/** Node actions (PRD §11.4) rendered under the person summary sidebar. */
export function TreeNodeActions({
  treeId,
  personId,
  isStart,
  mode,
  role,
}: {
  treeId: string;
  personId: string;
  isStart: boolean;
  mode: string;
  role: TreeRole;
}) {
  const canEdit = treeRoleAtLeast(role, "editor");
  return (
    <div className="mt-4 space-y-2.5">
      {!isStart && (
        <form action={setStartingPersonAction}>
          <input type="hidden" name="treeId" value={treeId} />
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="mode" value={mode} />
          <button
            type="submit"
            title="The tree will open from this person"
            className={`${subtleButtonClass} w-full text-left`}
          >
            Set as my starting person
          </button>
        </form>
      )}
      {canEdit && (
        <>
          <QuickAddForm
            treeId={treeId}
            personId={personId}
            mode={mode}
            direction="parent"
            label="Add parent"
            types={PARENT_RELATIONSHIP_TYPES}
          />
          <QuickAddForm
            treeId={treeId}
            personId={personId}
            mode={mode}
            direction="partner"
            label="Add spouse / partner"
            types={PARTNER_RELATIONSHIP_TYPES}
          />
          <QuickAddForm
            treeId={treeId}
            personId={personId}
            mode={mode}
            direction="child"
            label="Add child"
            types={PARENT_RELATIONSHIP_TYPES}
          />
        </>
      )}
    </div>
  );
}
