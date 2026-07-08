import { Field, inputClass, subtleButtonClass } from "@/components/form";
import { submitSuggestionAction } from "@/app/(app)/trees/[treeId]/suggestions/actions";

/**
 * "Suggest a correction" form (PRD §21) — rendered for members without direct
 * edit access on person profiles, media pages, and the Suggestions page.
 */
export function SuggestForm({
  treeId,
  targetType,
  targetId,
  targetLabel,
  returnTo,
}: {
  treeId: string;
  targetType: "person" | "media" | "tree";
  targetId?: string;
  targetLabel: string;
  returnTo: string;
}) {
  return (
    <details className="rounded-md border border-archive-100 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Suggest a correction{targetType === "tree" ? "" : ` for ${targetLabel}`}
      </summary>
      <form action={submitSuggestionAction} className="mt-3 space-y-3">
        <input type="hidden" name="treeId" value={treeId} />
        <input type="hidden" name="targetType" value={targetType} />
        {targetId && <input type="hidden" name="targetId" value={targetId} />}
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field label="What should change?">
          <textarea
            name="message"
            required
            rows={3}
            maxLength={10000}
            placeholder="e.g. The birth year should be 1891 — it's on her baptism record."
            className={inputClass}
          />
        </Field>
        <button type="submit" className={subtleButtonClass}>
          Send suggestion
        </button>
      </form>
    </details>
  );
}
