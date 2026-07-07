# OCR and AI Assistance

## OCR (built-in, local)

FamilyArchive runs [Tesseract](https://github.com/tesseract-ocr/tesseract)
inside the worker container — no external service, nothing leaves your server.

- **What gets OCR'd:** PDFs and media whose type is set to _Document_
  automatically after upload; editors can also press **Run OCR** on a media
  detail page (e.g. after reclassifying a photo of a letter as a document).
- **PDFs** are rendered at 300 dpi and OCR'd page by page (first 20 pages);
  page markers separate the text.
- **Languages:** English data ships in the image. For other languages, add the
  Tesseract data package to `docker/worker.Dockerfile` (e.g.
  `tesseract-ocr-data-deu`) and set:

```env
OCR_LANGUAGES=eng+deu
```

Extracted text is stored on the media item, shown on the detail page, and
included in search (Milestone 10).

## Manual transcription

Every PDF/document has a transcription field on its detail page — for
hard-to-read handwriting, corrections, or full manual transcriptions. Editors
(and contributors, for their own uploads) can edit it.

## Optional AI cleanup (disabled by default)

FamilyArchive **never sends your family's data to an external service unless
you explicitly configure it** (PRD §31.4). To enable the "Clean up OCR with
AI" button:

```env
AI_PROVIDER=anthropic        # or: openai
AI_API_KEY=sk-…
#AI_MODEL=claude-haiku-4-5-20251001   # optional; sensible default per provider
```

When an editor presses the button, the raw OCR text of that one document is
sent to the configured provider, and the cleaned-up version is saved as the
transcription. Raw OCR text is always preserved, and an existing transcription
is never overwritten (clear it first if you want an AI pass). The provider and
model used are recorded in the media item's metadata.
