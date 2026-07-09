import Link from "next/link";

import { GITHUB_URL } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-archive-100 py-10 text-sm text-archive-700">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-3">
        <div>
          <div className="font-semibold text-archive-900">
            Family<span className="text-accent-600">Archive</span>
          </div>
          <p className="mt-2 max-w-xs">
            Free, open-source, self-hosted family history. Made for families, not for data mining.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-medium text-archive-900">Documentation</div>
          <Link href="/docs/self-hosting/quickstart" className="no-underline hover:underline">
            Quickstart
          </Link>
          <Link href="/docs/concepts" className="no-underline hover:underline">
            Concepts
          </Link>
          <Link href="/docs/self-hosting/gedcom" className="no-underline hover:underline">
            GEDCOM import/export
          </Link>
          <Link href="/docs/self-hosting/backup-restore" className="no-underline hover:underline">
            Backup and restore
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-medium text-archive-900">Project</div>
          <a href={GITHUB_URL} className="no-underline hover:underline">
            Source code on GitHub
          </a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="no-underline hover:underline">
            License (AGPL-3.0-or-later)
          </a>
          <a href={`${GITHUB_URL}/issues`} className="no-underline hover:underline">
            Report an issue
          </a>
        </div>
      </div>
    </footer>
  );
}
