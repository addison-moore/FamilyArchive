import type { InputHTMLAttributes, ReactNode } from "react";

import { Alert } from "@/components/ui";

/** Small shared form styling primitives (server components). */

/**
 * Text inputs, selects and textareas: full width unless the caller adds a width
 * of its own (`${inputClass} w-56`). The styles are a components-layer class in
 * globals.css so that width wins; as utilities, `w-full` beat every other one.
 */
export const inputClass = "input";

/** Buttons are 38px tall, the same as fields, so any mix of them lines up in a row. */
export const buttonClass =
  "rounded-md border border-transparent bg-accent-700 px-4 py-2 text-sm font-medium text-white " +
  "hover:bg-accent-700/90 disabled:cursor-not-allowed disabled:opacity-50";

export const subtleButtonClass =
  "rounded-md border border-archive-200 bg-surface px-3 py-2 text-sm " +
  "text-archive-700 hover:bg-archive-50";

export const dangerButtonClass =
  "rounded-md border border-danger-line bg-surface px-3 py-2 text-sm text-danger hover:bg-danger-soft";

export const successButtonClass =
  "rounded-md border border-transparent bg-success-fill px-3 py-2 text-sm font-medium text-white " +
  "hover:bg-success-fill/90";

/** A small action inside a row of content, such as removing a relationship. */
export const textButtonClass =
  "rounded px-2 py-1 text-xs text-archive-700 hover:bg-danger-soft hover:text-danger";

/** The trigger of a Dropdown or popover. */
export const menuTriggerClass =
  "flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-archive-200 " +
  "px-2.5 py-1.5 text-sm hover:bg-archive-50";

/** A floating list of actions. Callers add the position and width. */
export const menuPanelClass = "z-20 rounded-md border border-archive-100 bg-surface p-1 shadow-lg";

export const menuItemClass =
  "block w-full rounded px-3 py-2 text-left text-sm no-underline hover:bg-archive-50";

/** A floating panel of content or a form. Callers add the position and width. */
export const popoverPanelClass =
  "z-20 rounded-xl border border-archive-100 bg-surface p-5 shadow-lg";

/** A form or detail that opens in place. The whole summary row is the target. */
export const disclosureClass = "rounded-md border border-archive-200 bg-surface";

export const disclosureSummaryClass =
  "cursor-pointer rounded-md px-3 py-2 text-sm font-medium hover:bg-archive-50";

export const disclosureBodyClass = "space-y-3 border-t border-archive-100 p-3";

export function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

/** The box stays on the first line when the label wraps. */
export function CheckboxField({
  children,
  ...input
}: { children: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-h-6 items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" {...input} />
      <span>{children}</span>
    </label>
  );
}

/**
 * Year, month and day in equal columns, with the "approximate" box under them.
 * Field names are `${prefix}Year`, `${prefix}Month`, `${prefix}Day`, `${prefix}Approx`.
 */
export function DateFields({
  prefix,
  year,
  month,
  day,
  approx,
}: {
  prefix: string;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  approx?: boolean | null;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Year">
          <input
            name={`${prefix}Year`}
            type="number"
            min={1}
            max={9999}
            defaultValue={year ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Month">
          <input
            name={`${prefix}Month`}
            type="number"
            min={1}
            max={12}
            defaultValue={month ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Day">
          <input
            name={`${prefix}Day`}
            type="number"
            min={1}
            max={31}
            defaultValue={day ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <CheckboxField name={`${prefix}Approx`} defaultChecked={approx ?? false}>
        approximate
      </CheckboxField>
    </div>
  );
}

export function FormError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <Alert tone="danger" className={className}>
      {message}
    </Alert>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-archive-100 bg-surface p-5 shadow-sm sm:p-6">
      {children}
    </div>
  );
}
