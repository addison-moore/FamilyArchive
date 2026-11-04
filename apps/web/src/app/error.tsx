"use client";

import { buttonClass, Card } from "@/components/form";

/** Anything a page throws lands here, rather than on Next's unstyled error screen. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
        <p className="mb-4 text-sm text-archive-700">
          This page couldn&apos;t load. Your archive is safe, so try again in a moment.
        </p>
        <button type="button" onClick={reset} className={buttonClass}>
          Try again
        </button>
      </Card>
    </div>
  );
}
