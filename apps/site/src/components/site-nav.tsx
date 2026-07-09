import Link from "next/link";

import { GITHUB_URL } from "@/lib/site";

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.66.41.36.78 1.06.78 2.14 0 1.54-.02 2.79-.02 3.17 0 .31.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-archive-100 bg-archive-50/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight no-underline">
          Family<span className="text-accent-600">Archive</span>
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/docs" className="text-archive-700 no-underline hover:text-archive-900">
            Docs
          </Link>
          <a
            href={GITHUB_URL}
            className="flex items-center gap-1.5 text-archive-700 no-underline hover:text-archive-900"
          >
            <GithubIcon />
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
