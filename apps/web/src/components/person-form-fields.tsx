import { GENDER_LABELS, GENDERS } from "@familyarchive/shared";

import { Field, inputClass } from "@/components/form";
import type { PersonRow } from "@/lib/people";

function DatePartInputs({
  prefix,
  person,
}: {
  prefix: "birth" | "death";
  person?: PersonRow | null;
}) {
  const year = person?.[`${prefix}Year`];
  const month = person?.[`${prefix}Month`];
  const day = person?.[`${prefix}Day`];
  const approx = person?.[`${prefix}Approx`];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Year">
        <input
          name={`${prefix}Year`}
          type="number"
          min={1}
          max={9999}
          defaultValue={year ?? ""}
          className={`${inputClass} w-24`}
        />
      </Field>
      <Field label="Month">
        <input
          name={`${prefix}Month`}
          type="number"
          min={1}
          max={12}
          defaultValue={month ?? ""}
          className={`${inputClass} w-20`}
        />
      </Field>
      <Field label="Day">
        <input
          name={`${prefix}Day`}
          type="number"
          min={1}
          max={31}
          defaultValue={day ?? ""}
          className={`${inputClass} w-20`}
        />
      </Field>
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <input type="checkbox" name={`${prefix}Approx`} defaultChecked={approx ?? false} />
        approximate
      </label>
    </div>
  );
}

/** Shared fields for the person create/edit forms. Leave parts blank for unknown dates. */
export function PersonFormFields({
  person,
  birthPlaceName,
  deathPlaceName,
}: {
  person?: PersonRow | null;
  birthPlaceName?: string | null;
  deathPlaceName?: string | null;
}) {
  return (
    <>
      <Field label="Full name">
        <input
          name="fullName"
          required
          maxLength={300}
          defaultValue={person?.fullName ?? ""}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Gender">
          <select
            name="gender"
            defaultValue={person?.gender ?? "unknown"}
            className={`${inputClass} w-auto`}
          >
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {GENDER_LABELS[gender]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Custom gender (if selected)">
          <input
            name="genderCustom"
            maxLength={100}
            defaultValue={person?.genderCustom ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <fieldset className="rounded-md border border-archive-100 p-3">
        <legend className="px-1 text-sm font-medium">Birth</legend>
        <DatePartInputs prefix="birth" person={person} />
        <div className="mt-2">
          <Field label="Place">
            <input
              name="birthPlace"
              maxLength={300}
              defaultValue={birthPlaceName ?? ""}
              placeholder="e.g. Galway, Ireland"
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="rounded-md border border-archive-100 p-3">
        <legend className="px-1 text-sm font-medium">Death</legend>
        <DatePartInputs prefix="death" person={person} />
        <div className="mt-2">
          <Field label="Place">
            <input
              name="deathPlace"
              maxLength={300}
              defaultValue={deathPlaceName ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>
      <Field label="Biography / story">
        <textarea
          name="biography"
          rows={6}
          maxLength={20000}
          defaultValue={person?.biography ?? ""}
          className={inputClass}
        />
      </Field>
      <Field label="Notes">
        <textarea
          name="notes"
          rows={3}
          maxLength={20000}
          defaultValue={person?.notes ?? ""}
          className={inputClass}
        />
      </Field>
    </>
  );
}
