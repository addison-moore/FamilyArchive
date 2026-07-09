import { Faq } from "@/components/faq";
import { FeatureSection } from "@/components/feature-section";
import { Hero } from "@/components/hero";
import { JsonLd } from "@/components/json-ld";
import { PrivacySection } from "@/components/privacy-section";
import { QuickstartStrip } from "@/components/quickstart-strip";

export default function LandingPage() {
  return (
    <>
      <JsonLd />
      <Hero />

      {/* Text-only: the hero screenshot directly above already shows the tree. */}
      <FeatureSection title="A tree the whole family can grow">
        <p>
          Explore an interactive family tree centered on any person — pan across generations, click
          a relative to see their story, and add people as you discover them.
        </p>
        <p>
          Invite relatives with a link. Roles keep it safe: some family members edit, others suggest
          changes for review, and grandparents can simply browse.
        </p>
      </FeatureSection>

      <FeatureSection
        title="A private home for a century of photos"
        screenshot="media-library"
        screenshotAlt="The FamilyArchive media library showing a grid of family photos and documents"
        reversed
      >
        <p>
          Upload photos, home movies, audio recordings, and scanned documents. Originals are never
          modified, duplicates are caught automatically, and everything is organized into
          collections you define.
        </p>
        <p>Store media on your server&apos;s disk, or point it at any S3-compatible storage.</p>
      </FeatureSection>

      <FeatureSection
        title="Old letters become searchable text"
        screenshot="media-lightbox"
        screenshotAlt="A scanned document opened in FamilyArchive with its extracted text shown alongside"
      >
        <p>
          Scanned letters, certificates, and newspaper clippings are read automatically with
          on-device text recognition, so a search for a name finds it inside a 1920s letter.
        </p>
        <p>
          Fix up transcriptions by hand, or optionally connect an AI provider — it&apos;s off by
          default and your documents never leave your server unless you turn it on.
        </p>
      </FeatureSection>

      <FeatureSection
        title="Put names to faces"
        screenshot="person-profile"
        screenshotAlt="A person profile in FamilyArchive showing their details, relationships, and tagged photos"
        reversed
      >
        <p>
          FamilyArchive spots faces in photos on your own machine — hover over a photo and click a
          face to tag who it is, just like the photo apps your family already knows.
        </p>
        <p>
          Every tagged photo appears on that person&apos;s profile, alongside their dates, places,
          relationships, and life story. No cloud face recognition, ever.
        </p>
      </FeatureSection>

      <QuickstartStrip />
      <PrivacySection />
      <Faq />
    </>
  );
}
