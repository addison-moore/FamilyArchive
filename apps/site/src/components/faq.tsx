export const FAQ_ITEMS = [
  {
    question: "Is FamilyArchive really free?",
    answer:
      "Yes. FamilyArchive is free software under the AGPL-3.0-or-later license. There is no paid tier, no license key, and no feature gate — you host it, you own it.",
  },
  {
    question: "What do I need to run it?",
    answer:
      "A machine with Docker and Docker Compose — a home server, a NAS, or a small VPS. The quickstart gets a full install (app, database, background workers) running with two commands.",
  },
  {
    question: "Can I import my tree from Ancestry or FamilySearch?",
    answer:
      "Yes. Export your tree as a GEDCOM file — the standard format every major genealogy service supports — and import it into FamilyArchive. Original GEDCOM data is preserved, and overlapping imports can be merged person by person.",
  },
  {
    question: "Is any of my family's data sent to the cloud?",
    answer:
      "No. Thumbnails, text extraction (OCR), and face detection all run locally on your server. Optional AI-assisted transcription exists, but it is off by default and only used if an admin explicitly configures a provider.",
  },
  {
    question: "How do backups work?",
    answer:
      "Two things to back up: the Postgres database and the media folder. The docs include a step-by-step backup and restore guide using standard tools.",
  },
  {
    question: "Can relatives help without breaking things?",
    answer:
      "Yes. Every member gets a role — admins and editors change things directly, while contributors submit suggestions that an editor reviews before anything is applied. An audit log records who changed what.",
  },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h2 className="font-display text-center text-2xl font-semibold tracking-tight text-archive-900 sm:text-3xl">
        Frequently asked questions
      </h2>
      <div className="mt-8 space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.question}
            className="group rounded-xl border border-archive-100 bg-surface px-5 py-4"
          >
            <summary className="cursor-pointer list-none font-medium text-archive-900">
              <span className="mr-2 inline-block text-accent-600 transition-transform group-open:rotate-90">
                ›
              </span>
              {item.question}
            </summary>
            <p className="mt-3 text-sm leading-6 text-archive-700">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
