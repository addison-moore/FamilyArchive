import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DOC_SECTIONS, docBySlug } from "@/lib/docs-manifest";

import { renderDoc } from "@/lib/markdown";

export const dynamic = "force-static";
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
  return DOC_SECTIONS.flatMap((section) => section.entries.map((doc) => ({ slug: doc.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc) return {};
  const { title, description } = await renderDoc(doc);
  return {
    title,
    description,
    alternates: { canonical: `/docs/${doc.slug.join("/")}` },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc) notFound();
  const { html } = await renderDoc(doc);
  return <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
