import Link from "next/link";

import { Screenshot } from "@/components/screenshot";
import { GITHUB_URL } from "@/lib/site";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 text-center sm:pt-24">
      <h1 className="font-display mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-archive-900 sm:text-6xl">
        Your family&apos;s history. Your server. Forever.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-archive-700">
        FamilyArchive is a free, open-source, self-hosted home for your family tree, photos, home
        movies, and scanned letters — searchable, taggable, and private by default.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Link
          href="/docs/self-hosting/quickstart"
          className="rounded-lg bg-accent-700 px-5 py-2.5 font-medium text-white no-underline shadow-sm hover:opacity-90"
        >
          Get started
        </Link>
        <a
          href={GITHUB_URL}
          className="rounded-lg border border-archive-100 bg-surface px-5 py-2.5 font-medium text-archive-900 no-underline shadow-sm hover:bg-archive-100"
        >
          View on GitHub
        </a>
      </div>
      <div className="mx-auto mt-14 max-w-5xl">
        <Screenshot
          name="tree-canvas"
          alt="The FamilyArchive tree view showing an interactive family tree of the fictional Hartwell family"
          priority
          framed
        />
      </div>
    </section>
  );
}
