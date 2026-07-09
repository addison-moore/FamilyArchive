/**
 * Navigation manifest for the docs section. The markdown itself lives at the
 * repo root (`docs/`) and stays the single source of truth — this file only
 * fixes ordering, grouping, and titles for the site. A build-time guard in
 * markdown.ts fails the build if a docs file is missing from this list.
 */
export type DocEntry = {
  /** URL segments under /docs — [] is the index (docs/README.md). */
  slug: string[];
  /** Path relative to the repo-root docs/ directory. */
  file: string;
  title: string;
};

export type DocSection = {
  label: string;
  entries: DocEntry[];
};

export const DOCS_INDEX: DocEntry = {
  slug: [],
  file: "README.md",
  title: "Documentation",
};

export const DOC_SECTIONS: DocSection[] = [
  {
    label: "Concepts",
    entries: [{ slug: ["concepts"], file: "concepts.md", title: "Archives, sources, branches" }],
  },
  {
    label: "Self-hosting",
    entries: [
      {
        slug: ["self-hosting", "quickstart"],
        file: "self-hosting/quickstart.md",
        title: "Quickstart",
      },
      {
        slug: ["self-hosting", "environment"],
        file: "self-hosting/environment.md",
        title: "Environment variables",
      },
      {
        slug: ["self-hosting", "gedcom"],
        file: "self-hosting/gedcom.md",
        title: "GEDCOM import/export",
      },
      {
        slug: ["self-hosting", "storage"],
        file: "self-hosting/storage.md",
        title: "Storage",
      },
      {
        slug: ["self-hosting", "ocr-ai"],
        file: "self-hosting/ocr-ai.md",
        title: "OCR and AI assistance",
      },
      {
        slug: ["self-hosting", "backup-restore"],
        file: "self-hosting/backup-restore.md",
        title: "Backup and restore",
      },
    ],
  },
  {
    label: "Development",
    entries: [
      {
        slug: ["development", "setup"],
        file: "development/setup.md",
        title: "Development setup",
      },
    ],
  },
];

export const ALL_DOCS: DocEntry[] = [DOCS_INDEX, ...DOC_SECTIONS.flatMap((s) => s.entries)];

export function docBySlug(slug: string[]): DocEntry | undefined {
  const key = slug.join("/");
  return ALL_DOCS.find((doc) => doc.slug.join("/") === key);
}

/** Site route for a docs file path (relative to docs/), or null if unknown. */
export function routeForDocFile(file: string): string | null {
  const doc = ALL_DOCS.find((d) => d.file === file);
  if (!doc) return null;
  return doc.slug.length === 0 ? "/docs" : `/docs/${doc.slug.join("/")}`;
}
