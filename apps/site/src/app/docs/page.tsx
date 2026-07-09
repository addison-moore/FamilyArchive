import type { Metadata } from "next";

import { DOCS_INDEX } from "@/lib/docs-manifest";
import { renderDoc } from "@/lib/markdown";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const { description } = await renderDoc(DOCS_INDEX);
  return {
    title: "Documentation",
    description,
    alternates: { canonical: "/docs" },
  };
}

export default async function DocsIndexPage() {
  const { html } = await renderDoc(DOCS_INDEX);
  return <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
