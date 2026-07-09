import { GITHUB_URL } from "@/lib/site";

const points = [
  {
    title: "Your data stays on your server",
    body: "There is no FamilyArchive company account, no cloud sync, and no telemetry. Photos, documents, and the tree itself live wherever you install it.",
  },
  {
    title: "Private by default",
    body: "Archives are invitation-only. A public, read-only view exists — but only if an admin explicitly turns it on.",
  },
  {
    title: "No AI unless you say so",
    body: "Face detection and OCR run entirely on your own machine. External AI providers are disabled by default and only ever used if an admin configures one.",
  },
  {
    title: "Free software, forever",
    body: "AGPL-3.0-or-later. Inspect the code, run it anywhere, and know that the archive you build today can't be discontinued out from under you.",
  },
];

export function PrivacySection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="font-display text-center text-2xl font-semibold tracking-tight text-archive-900 sm:text-3xl">
        Built on ownership, not accounts
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {points.map((point) => (
          <div
            key={point.title}
            className="rounded-xl border border-archive-100 bg-surface p-6 shadow-sm"
          >
            <h3 className="font-semibold text-archive-900">{point.title}</h3>
            <p className="mt-2 text-sm leading-6 text-archive-700">{point.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-archive-700">
        Every line of the application is open source —{" "}
        <a href={GITHUB_URL} className="text-accent-600 underline underline-offset-2">
          read it on GitHub
        </a>
        .
      </p>
    </section>
  );
}
