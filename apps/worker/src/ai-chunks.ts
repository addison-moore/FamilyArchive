/**
 * Long documents go to the AI provider in pieces. Sending one request meant
 * cutting the text at a fixed length and accepting whatever fit in the output
 * cap, so a long document came back as a shorter transcription with nothing to
 * say the rest was gone.
 */

/** Roughly 3–4k tokens, leaving plenty of a request's output cap for the reply. */
const MAX_CLEANUP_CHUNK_CHARS = 12_000;

/** Cut an over-long paragraph at the last line break or space before the limit. */
function splitParagraph(paragraph: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const cut = breakAt > 0 ? breakAt : maxChars;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** Split text into chunks of at most `maxChars`, on paragraph boundaries where it can. */
export function splitForCleanup(text: string, maxChars = MAX_CLEANUP_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/).flatMap((p) => splitParagraph(p, maxChars))) {
    if (current && current.length + 2 + paragraph.length > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}
