import type { ReactNode } from "react";

import { Screenshot } from "@/components/screenshot";

export function FeatureSection({
  title,
  screenshot,
  screenshotAlt,
  reversed = false,
  children,
}: {
  title: string;
  screenshot?: string;
  screenshotAlt?: string;
  reversed?: boolean;
  children: ReactNode;
}) {
  if (!screenshot || !screenshotAlt) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-archive-900 sm:text-3xl">
            {title}
          </h2>
          <div className="mt-4 space-y-3 text-archive-700">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div
        className={`flex flex-col items-center gap-8 lg:gap-14 ${
          reversed ? "lg:flex-row-reverse" : "lg:flex-row"
        }`}
      >
        <div className="max-w-md">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-archive-900 sm:text-3xl">
            {title}
          </h2>
          <div className="mt-4 space-y-3 text-archive-700">{children}</div>
        </div>
        <div className="min-w-0 flex-1">
          <Screenshot name={screenshot} alt={screenshotAlt} />
        </div>
      </div>
    </section>
  );
}
