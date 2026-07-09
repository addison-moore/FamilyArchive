import type { MetadataRoute } from "next";

import { DOC_SECTIONS } from "@/lib/docs-manifest";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/docs`, changeFrequency: "monthly", priority: 0.8 },
    ...DOC_SECTIONS.flatMap((section) =>
      section.entries.map((doc) => ({
        url: `${SITE_URL}/docs/${doc.slug.join("/")}`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ),
  ];
}
