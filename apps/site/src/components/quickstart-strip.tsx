import Link from "next/link";

export function QuickstartStrip() {
  return (
    <section className="border-y border-archive-100 bg-surface py-14">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-archive-900 sm:text-3xl">
          Running in two commands
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-archive-700">
          All you need is a machine with Docker — a home server, a NAS, or a small VPS. Bring your
          existing tree from Ancestry, FamilySearch, or Gramps with GEDCOM import.
        </p>
        <pre className="mx-auto mt-6 max-w-xl overflow-x-auto rounded-xl border border-archive-100 bg-archive-50 p-5 text-left text-sm leading-7 text-archive-800">
          <code>
            cp .env.example .env{"\n"}
            docker compose up -d
          </code>
        </pre>
        <Link
          href="/docs/self-hosting/quickstart"
          className="mt-6 inline-block font-medium text-accent-600"
        >
          Read the quickstart guide →
        </Link>
      </div>
    </section>
  );
}
