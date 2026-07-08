import type { ReactNode } from "react";

/** Small shared form styling primitives (server components). */

export const inputClass =
  "w-full rounded-md border border-archive-100 bg-surface px-3 py-2 text-sm " +
  "focus:border-accent-600 focus:outline-none";

export const buttonClass =
  "rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white " +
  "hover:bg-accent-600/90 disabled:cursor-not-allowed disabled:opacity-50";

export const subtleButtonClass =
  "rounded-md border border-archive-100 bg-surface px-3 py-1.5 text-sm " +
  "text-archive-700 hover:bg-archive-50";

export const dangerButtonClass =
  "rounded-md border border-danger-line bg-surface px-3 py-1.5 text-sm text-danger hover:bg-danger-soft";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-archive-100 bg-surface p-6 shadow-sm">{children}</div>
  );
}
