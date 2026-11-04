import {
  PARENT_RELATIONSHIP_TYPES,
  PARTNER_RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  treeRoleAtLeast,
  type RelationshipType,
  type TreeRole,
} from "@familyarchive/shared";

import {
  disclosureBodyClass,
  disclosureClass,
  disclosureSummaryClass,
  Field,
  inputClass,
  subtleButtonClass,
} from "@/components/form";
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
    <details className={disclosureClass}>
      <summary className={disclosureSummaryClass}>{label}</summary>
      <form action={quickAddRelativeAction} className={disclosureBodyClass}>
        <input type="hidden" name="treeId" value={treeId} />
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="direction" value={direction} />
        <input type="hidden" name="mode" value={mode} />
        <Field label="Full name">
          <input name="fullName" required maxLength={300} className={inputClass} />
        </Field>
        <Field label="Type">
          <select name="type" className={inputClass}>
            {types.map((type) => (
              <option key={type} value={type}>
                {RELATIONSHIP_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Birth year (optional)">
          <input name="birthYear" type="number" min={1} max={9999} className={inputClass} />
        </Field>
        <button type="submit" className={subtleButtonClass}>
          Add
        </button>
      </form>
    </details>
  );
}

/**
 * Node actions for the selected person, rendered alongside the person summary.
 *
 * The auto-fit grid is what lets this sit in either tree layout without a mode
 * prop: in the narrow sidebar the tracks collapse to a single column, and in
 * the wide layout's full-width strip they spread into a row.
 */
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] items-start gap-2.5">
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
