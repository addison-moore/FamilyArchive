import fs from "node:fs/promises";
import path from "node:path";

import rehypeShiki from "@shikijs/rehype";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { ALL_DOCS, type DocEntry } from "./docs-manifest";
import { rewriteRelativeLinks } from "./rewrite-links";

/** Repo-root docs/ — read at BUILD time only (all docs routes are force-static). */
const DOCS_DIR = path.join(process.cwd(), "..", "..", "docs");

async function listMarkdownFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(path.join(dir, entry.name), rel)));
    } else if (entry.name.endsWith(".md")) {
      files.push(rel);
    }
  }
  return files;
}

/** Fails the build if a docs file was added without a manifest entry. */
export async function assertManifestComplete(): Promise<void> {
  const onDisk = await listMarkdownFiles(DOCS_DIR);
  const known = new Set(ALL_DOCS.map((doc) => doc.file));
  const missing = onDisk.filter((file) => !known.has(file));
  if (missing.length > 0) {
    throw new Error(
      `docs manifest (apps/site/src/lib/docs-manifest.ts) is missing: ${missing.join(", ")}`,
    );
  }
}

export type RenderedDoc = {
  html: string;
  /** First h1 text, for <title>. */
  title: string;
  /** First paragraph text, for the meta description. */
  description: string;
};

export async function renderDoc(doc: DocEntry): Promise<RenderedDoc> {
  await assertManifestComplete();
  const markdown = await fs.readFile(path.join(DOCS_DIR, doc.file), "utf8");

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(rewriteRelativeLinks, { docFile: doc.file })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeShiki, {
      themes: { light: "vitesse-light", dark: "vitesse-dark" },
      defaultColor: "light",
      langs: ["bash", "dotenv"],
      langAlias: { env: "dotenv" },
      // Vitesse's comment greens fail WCAG AA on their backgrounds; adjust both.
      colorReplacements: {
        "vitesse-light": { "#a0ada0": "#5c6e5c" },
        "vitesse-dark": { "#758575dd": "#8fa38f" },
      },
    })
    .use(rehypeStringify)
    .process(markdown);

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const firstParagraph = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#") && !block.startsWith("```"));

  return {
    html: String(file),
    title: titleMatch?.[1]?.trim() ?? doc.title,
    description: (firstParagraph ?? "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " "),
  };
}
