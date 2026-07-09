import { FAQ_ITEMS } from "@/components/faq";
import { GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "LifestyleApplication",
      applicationSubCategory: "Genealogy software",
      operatingSystem: "Self-hosted (Docker)",
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      softwareVersion: "0.1.0",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      screenshot: `${SITE_URL}/screenshots/tree-canvas-light.png`,
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
