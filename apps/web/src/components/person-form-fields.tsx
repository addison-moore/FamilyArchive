import { GENDER_LABELS, GENDERS } from "@familyarchive/shared";

import { CheckboxField, DateFields, Field, inputClass } from "@/components/form";
import type { PersonRow } from "@/lib/people";

function LifeEvent({
  legend,
  prefix,
  person,
  placeName,
  placePlaceholder,
}: {
  legend: string;
  prefix: "birth" | "death";
  person?: PersonRow | null;
  placeName?: string | null;
  placePlaceholder?: string;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-archive-200 p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <DateFields
        prefix={prefix}
        year={person?.[`${prefix}Year`]}
        month={person?.[`${prefix}Month`]}
        day={person?.[`${prefix}Day`]}
        approx={person?.[`${prefix}Approx`]}
      />
      <Field label="Place">
        <input
          name={`${prefix}Place`}
          maxLength={300}
          defaultValue={placeName ?? ""}
          placeholder={placePlaceholder}
          className={inputClass}
        />
      </Field>
    </fieldset>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gender">
          <select name="gender" defaultValue={person?.gender ?? "unknown"} className={inputClass}>
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
      <LifeEvent
        legend="Birth"
        prefix="birth"
        person={person}
        placeName={birthPlaceName}
        placePlaceholder="e.g. Galway, Ireland"
      />
      <LifeEvent legend="Death" prefix="death" person={person} placeName={deathPlaceName} />
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
      <CheckboxField name="verified" defaultChecked={person?.verified ?? false}>
        <span className="font-medium">Verified</span>
        <span className="block text-archive-700">
          This person has been confirmed against evidence, rather than being a likely match.
          Verified people are outlined on the tree.
        </span>
      </CheckboxField>
    </>
  );
}
